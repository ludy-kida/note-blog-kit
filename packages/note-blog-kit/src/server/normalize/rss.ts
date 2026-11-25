/**
 * note の RSS（/{user}/rss）を公開型に変換する。
 * XML パーサーは使わず、item ごとに必要な要素だけを取り出す（依存を増やさないため。人の判断）。
 * 使う要素は fixtures/rss/feed.xml に実在するものだけ。形が違えば NoteSchemaError にする。
 */
import { z } from 'zod';
import type { NoteArticlePage, NoteArticleSummary } from '../../core/types.js';
import { NoteSchemaError } from '../errors.js';
import { NOTE_KEY_RE, NOTE_USER_RE } from '../patterns.js';
import { htmlToExcerpt, isHttpsUrl } from './shared.js';

const CDATA_START = '<![CDATA[';
const CDATA_END = ']]>';
/** RSS の item 数の上限（note の RSS は25件。これを大きく超えるレスポンスは形が違うとみなす） */
const MAX_ITEMS = 100;

/** XML の実体参照を戻す（CDATA の外のテキスト用） */
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,8}|#[0-9]{1,10}|amp|lt|gt|quot|apos);/g, (whole, name: string) => {
    switch (name) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return valid ? String.fromCodePoint(code) : whole;
  });
}

/**
 * CDATA の中身を同じ長さの空白に置き換えた文字列を作る（位置は元の文字列と同じ）。
 * 要素や </item> の検索はこの文字列で行い、CDATA の中にある偽のタグを本物と取り違えないようにする。
 */
function maskCdata(xml: string): string {
  let out = '';
  let position = 0;
  for (;;) {
    const start = xml.indexOf(CDATA_START, position);
    if (start === -1) return out + xml.slice(position);
    const end = xml.indexOf(CDATA_END, start + CDATA_START.length);
    if (end === -1) throw new Error('閉じていない CDATA があります');
    out += xml.slice(position, start + CDATA_START.length) + ' '.repeat(end - start - CDATA_START.length) + CDATA_END;
    position = end + CDATA_END.length;
  }
}

/** 要素の中身をテキストにする。CDATA の区間はそのまま、区間の外は実体参照を戻す（複数の区間もつなぐ） */
function readText(raw: string): string {
  let out = '';
  let position = 0;
  for (;;) {
    const start = raw.indexOf(CDATA_START, position);
    if (start === -1) return (out + decodeXml(raw.slice(position))).trim();
    // maskCdata で閉じていることは確かめてある
    const end = raw.indexOf(CDATA_END, start + CDATA_START.length);
    out += decodeXml(raw.slice(position, start)) + raw.slice(start + CDATA_START.length, end);
    position = end + CDATA_END.length;
  }
}

interface ItemSource {
  /** item の元の文字列 */
  text: string;
  /** CDATA の中身を空白にした文字列（位置は text と同じ） */
  masked: string;
}

/** 要素の中身を返す（なければ undefined）。タグの検索は CDATA の外だけで行う */
function readElement(item: ItemSource, tag: string): string | undefined {
  const open = `<${tag}>`;
  const start = item.masked.indexOf(open);
  if (start === -1) return undefined;
  const end = item.masked.indexOf(`</${tag}>`, start + open.length);
  if (end === -1) return undefined;
  return readText(item.text.slice(start + open.length, end));
}

interface RawItem {
  title?: string | undefined;
  link?: string | undefined;
  pubDate?: string | undefined;
  description?: string | undefined;
  thumbnail?: string | undefined;
  creatorName?: string | undefined;
  creatorImage?: string | undefined;
}

function readItem(item: ItemSource): RawItem {
  return {
    title: readElement(item, 'title'),
    link: readElement(item, 'link'),
    pubDate: readElement(item, 'pubDate'),
    description: readElement(item, 'description'),
    thumbnail: readElement(item, 'media:thumbnail'),
    creatorName: readElement(item, 'note:creatorName'),
    creatorImage: readElement(item, 'note:creatorImage'),
  };
}

/** item を順に取り出す。閉じていない item・属性付きの item・多すぎる item は例外（入力長に比例する時間で終わる） */
function splitItems(xml: string): ItemSource[] {
  const masked = maskCdata(xml);
  // 属性付きの <item ...> は想定していない形（黙って0件にしない）
  if (/<item[\s/]/.test(masked)) throw new Error('属性付きの item があります');
  const items: ItemSource[] = [];
  let position = 0;
  for (;;) {
    const start = masked.indexOf('<item>', position);
    if (start === -1) return items;
    const end = masked.indexOf('</item>', start);
    if (end === -1) throw new Error('閉じていない item があります');
    if (items.length >= MAX_ITEMS) throw new Error(`item が ${MAX_ITEMS} 件を超えています`);
    items.push({ text: xml.slice(start + '<item>'.length, end), masked: masked.slice(start + '<item>'.length, end) });
    position = end + '</item>'.length;
  }
}

/** RSS の日時（例：Thu, 12 Nov 2026 09:38:42 +0900） */
const RFC822_RE = /^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;

const ARTICLE_URL_RE = /^https:\/\/note\.com\/([^/]+)\/n\/([^/?#]+)$/;

/** 画像 URL。なければ（空・要素なし）null。あれば https に限る */
const optionalImage = z
  .string()
  .optional()
  .refine((value) => value === undefined || value.trim() === '' || isHttpsUrl(value), 'https の URL ではありません');

function itemSchema(user: string) {
  return z.object({
    title: z.string().min(1),
    link: z.string().refine((value) => {
      const match = ARTICLE_URL_RE.exec(value);
      return (
        match !== null && NOTE_USER_RE.test(match[1] ?? '') && NOTE_KEY_RE.test(match[2] ?? '') && match[1] === user
      );
    }, `https://note.com/${user}/n/{記事キー} の形ではありません`),
    pubDate: z
      .string()
      .refine((value) => RFC822_RE.test(value) && !Number.isNaN(Date.parse(value)), 'RFC 822 の日時ではありません'),
    description: z.string().optional(),
    thumbnail: optionalImage,
    creatorName: z.string(),
    creatorImage: optionalImage,
  });
}

function toNullableUrl(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value;
}

/** description の HTML から、末尾の「続きをみる」リンクを除いて抜粋を作る（正規表現の後戻りを避ける） */
function toExcerpt(description: string | undefined): string {
  if (description === undefined) return '';
  let html = description.trimEnd();
  if (html.endsWith('</a>')) {
    const textEnd = html.length - '</a>'.length;
    const open = html.lastIndexOf('<a', textEnd);
    const close = open === -1 ? -1 : html.indexOf('>', open);
    if (close !== -1 && close < textEnd && html.slice(close + 1, textEnd).trim() === '続きをみる') {
      html = html.slice(0, open);
    }
  }
  return htmlToExcerpt(html);
}

function schemaError(message: string, issues: { path: string; message: string }[]): NoteSchemaError {
  return new NoteSchemaError(message, { issues });
}

/**
 * RSS（XML の文字列）を検証し、`NoteArticlePage` に変換する。RSS は最新25件だけの1ページ。
 * @param user 要求したユーザー名（別ユーザーの記事が混ざっていれば NoteSchemaError）
 * @throws {NoteSchemaError} RSS でない・使う要素が欠けている・形が違うとき
 */
export function normalizeRss(xml: string, user: string): NoteArticlePage {
  if (!xml.includes('<rss') || !xml.includes('<channel>')) {
    throw schemaError('Unexpected shape of the note RSS response', [{ path: '', message: 'RSS ではありません' }]);
  }
  let items: ItemSource[];
  try {
    items = splitItems(xml);
  } catch (error) {
    throw schemaError('Unexpected shape of the note RSS response', [
      { path: 'items', message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  const schema = itemSchema(user);
  const articles: NoteArticleSummary[] = items.map((item, index) => {
    const result = schema.safeParse(readItem(item));
    if (!result.success) {
      throw schemaError(
        'Unexpected shape of the note RSS response',
        result.error.issues.map((issue) => ({
          path: ['items', index, ...issue.path].map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    const raw = result.data;
    const key = ARTICLE_URL_RE.exec(raw.link)?.[2] as string;
    return {
      key,
      title: raw.title,
      url: raw.link,
      publishedAt: new Date(raw.pubDate).toISOString(),
      excerpt: toExcerpt(raw.description),
      eyecatchUrl: toNullableUrl(raw.thumbnail),
      hashtags: [],
      likeCount: null,
      price: null,
      author: { name: raw.creatorName, urlname: user, imageUrl: toNullableUrl(raw.creatorImage) },
      source: 'rss',
    };
  });
  return { articles, page: 1, totalCount: null, isLastPage: true, source: 'rss' };
}
