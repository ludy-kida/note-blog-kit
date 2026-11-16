/**
 * 記事本文 API（/api/v3/notes/{key}）のレスポンスを公開型に変換する。
 * 使うキーは fixtures/notes/*.json に実在するものだけ。未知のキーは無視する。
 * 本文は必ず sanitizeNoteBody を通す（外す経路は作らない）。
 */
import { z } from 'zod';
import type { NoteArticle, NoteEmbed, NoteEyecatch, NoteTocItem } from '../../core/types.js';
import { NoteSchemaError } from '../errors.js';
import { SAFE_VALUE, sanitizeNoteBody } from '../sanitize/sanitize.js';
import { emptyToNull, httpsUrl, isHttpsUrl, optionalHttpsUrl } from './shared.js';

/** 抜粋の長さ（一覧 API の body と同じ 240 文字） */
const EXCERPT_LENGTH = 240;

const noteSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  body: z.string(),
  note_url: httpsUrl,
  publish_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '日時として解釈できません'),
  // 見出し画像のない記事の例は fixture にないため、null も「画像なし」として受け付ける
  eyecatch: optionalHttpsUrl.nullable(),
  eyecatch_alt: z.string().nullable(),
  eyecatch_width: z.number().nullable(),
  eyecatch_height: z.number().nullable(),
  hashtag_notes: z.array(z.object({ hashtag: z.object({ name: z.string() }) })),
  like_count: z.number(),
  price: z.number(),
  can_read: z.boolean(),
  // 目次と埋め込みは、1件の形が違うだけで記事全体を失敗させないよう、項目ごとに検証して除く
  index: z.array(z.unknown()),
  embedded_contents: z.array(z.unknown()),
  user: z.object({
    nickname: z.string(),
    urlname: z.string(),
    user_profile_image_path: optionalHttpsUrl,
  }),
});

const responseSchema = z.object({ data: noteSchema });

type RawNote = z.infer<typeof noteSchema>;

const tocItemSchema = z.object({
  body: z.string(),
  name: z.string().regex(SAFE_VALUE),
  level: z.enum(['h2', 'h3']),
});

const embedSchema = z.object({
  key: z.string().regex(SAFE_VALUE),
  service: z.string().min(1),
  url: z.string().refine(isHttpsUrl),
});

function toToc(index: unknown[]): NoteTocItem[] {
  return index.flatMap((item) => {
    const result = tocItemSchema.safeParse(item);
    if (!result.success) return [];
    const { body, name, level } = result.data;
    // 本文の見出しの id と同じ規則（sanitizeNoteBody が nbk- を付ける）
    return [{ id: `nbk-${name}`, text: body, level: level === 'h2' ? 2 : 3 }];
  });
}

function toEmbeds(contents: unknown[]): NoteEmbed[] {
  return contents.flatMap((item) => {
    const result = embedSchema.safeParse(item);
    return result.success ? [{ key: result.data.key, service: result.data.service, url: result.data.url }] : [];
  });
}

function toEyecatch(note: RawNote): NoteEyecatch | null {
  const url = note.eyecatch === null ? null : emptyToNull(note.eyecatch);
  if (url === null) return null;
  return { url, width: note.eyecatch_width, height: note.eyecatch_height, alt: note.eyecatch_alt ?? '' };
}

const BLOCK_END = /<br \/>|<\/(?:p|h2|h3|h4|li|blockquote|figcaption|pre|td|th|tr)>/g;

/** サニタイズ済みの本文から、タグを除いたテキストの先頭を作る */
function toExcerpt(bodyHtml: string): string {
  const text = bodyHtml
    .replace(BLOCK_END, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, EXCERPT_LENGTH).join('');
}

/**
 * 記事本文 API のレスポンス（パース済みの JSON）を検証し、`NoteArticle` に変換する。
 * @throws {NoteSchemaError} 使うキーが欠けている・型が違うとき
 */
export function normalizeNote(json: unknown): NoteArticle {
  const result = responseSchema.safeParse(json);
  if (!result.success) {
    throw new NoteSchemaError('Unexpected shape of the note article response', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    });
  }
  const note = result.data.data;
  const bodyHtml = sanitizeNoteBody(note.body);
  const eyecatch = toEyecatch(note);
  return {
    key: note.key,
    title: note.name,
    url: note.note_url,
    publishedAt: new Date(note.publish_at).toISOString(),
    excerpt: toExcerpt(bodyHtml),
    eyecatchUrl: eyecatch?.url ?? null,
    hashtags: note.hashtag_notes.map(({ hashtag }) => hashtag.name.replace(/^#/, '')),
    likeCount: note.like_count,
    price: note.price,
    author: {
      name: note.user.nickname,
      urlname: note.user.urlname,
      imageUrl: emptyToNull(note.user.user_profile_image_path),
    },
    source: 'api',
    bodyHtml,
    isPartial: !note.can_read,
    eyecatch,
    toc: toToc(note.index),
    embeds: toEmbeds(note.embedded_contents),
  };
}
