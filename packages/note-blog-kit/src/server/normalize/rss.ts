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

/** 要素の中身を返す（なければ undefined）。CDATA はそのまま、それ以外は実体参照を戻す */
function readElement(item: string, tag: string): { value: string; start: number; end: number } | undefined {
  const open = `<${tag}>`;
  const start = item.indexOf(open);
  if (start === -1) return undefined;
  const close = `</${tag}>`;
  const end = item.indexOf(close, start + open.length);
  if (end === -1) return undefined;
  const raw = item.slice(start + open.length, end).trim();
  const value =
    raw.startsWith(CDATA_START) && raw.endsWith(CDATA_END)
      ? raw.slice(CDATA_START.length, -CDATA_END.length)
      : decodeXml(raw);
  return { value, start, end: end + close.length };
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

function readItem(item: string): RawItem {
  // description（CDATA の HTML）の中にある文字列を、ほかの要素と取り違えないよう先に取り除く
  const description = readElement(item, 'description');
  const rest = description ? item.slice(0, description.start) + item.slice(description.end) : item;
  return {
    title: readElement(rest, 'title')?.value,
    link: readElement(rest, 'link')?.value,
    pubDate: readElement(rest, 'pubDate')?.value,
    description: description?.value,
    thumbnail: readElement(rest, 'media:thumbnail')?.value,
    creatorName: readElement(rest, 'note:creatorName')?.value,
    creatorImage: readElement(rest, 'note:creatorImage')?.value,
  };
}

/** item の文字列を順に取り出す。閉じていない item があれば例外（入力長に比例する時間で終わる） */
function splitItems(xml: string): string[] {
  const items: string[] = [];
  let position = 0;
  for (;;) {
    const start = xml.indexOf('<item>', position);
    if (start === -1) return items;
    const end = xml.indexOf('</item>', start);
    if (end === -1) throw new Error('閉じていない item があります');
    items.push(xml.slice(start + '<item>'.length, end));
    position = end + '</item>'.length;
  }
}

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
    pubDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '日時として解釈できません'),
    description: z.string().optional(),
    thumbnail: optionalImage,
    creatorName: z.string(),
    creatorImage: optionalImage,
  });
}

function toNullableUrl(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value;
}

/** description の HTML から、末尾の「続きをみる」リンクを除いて抜粋を作る */
function toExcerpt(description: string | undefined): string {
  if (description === undefined) return '';
  return htmlToExcerpt(description.replace(/<a\b[^>]*>\s*続きをみる\s*<\/a>\s*$/, ''));
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
  let items: string[];
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
  return { articles, page: 1, totalCount: null, isLastPage: true };
}
