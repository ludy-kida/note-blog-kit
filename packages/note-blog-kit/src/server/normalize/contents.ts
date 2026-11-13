/**
 * 一覧 API（/api/v2/creators/{user}/contents）のレスポンスを公開型に変換する。
 * 使うキーは fixtures/contents/*.json に実在するものだけ。未知のキーは無視する。
 */
import { z } from 'zod';
import type { NoteArticlePage, NoteArticleSummary } from '../../core/types.js';
import { NoteSchemaError } from '../errors.js';

/**
 * https の絶対 URL か。描画側（href・src）に `javascript:` などを渡さないため、ここで検証する。
 * 前後の空白や制御文字を含む値は、ブラウザが除去して別のスキームとして解釈しうるため受け付けない。
 */
function hasControlOrSpace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return /\s/.test(value);
}

function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://') || hasControlOrSpace(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const httpsUrl = z.string().refine(isHttpsUrl, 'https の URL ではありません');
/** 画像 URL。空文字は「画像なし」として許す */
const optionalHttpsUrl = z
  .string()
  .refine((value) => value.trim() === '' || isHttpsUrl(value), 'https の URL ではありません');

const contentSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  noteUrl: httpsUrl,
  publishAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '日時として解釈できません'),
  body: z.string(),
  eyecatch: optionalHttpsUrl,
  hashtags: z.array(z.object({ hashtag: z.object({ name: z.string() }) })),
  likeCount: z.number(),
  price: z.number(),
  user: z.object({
    nickname: z.string(),
    urlname: z.string(),
    userProfileImagePath: optionalHttpsUrl,
  }),
});

const contentsResponseSchema = z.object({
  data: z.object({
    contents: z.array(contentSchema),
    isLastPage: z.boolean(),
    totalCount: z.number(),
  }),
});

type RawContent = z.infer<typeof contentSchema>;

/** 空文字を null にそろえる（fixture では null の例がないため、null は受け付けずスキーマエラーにする） */
function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

function toSummary(content: RawContent): NoteArticleSummary {
  return {
    key: content.key,
    title: content.name,
    url: content.noteUrl,
    publishedAt: new Date(content.publishAt).toISOString(),
    excerpt: content.body.trim(),
    eyecatchUrl: emptyToNull(content.eyecatch),
    hashtags: content.hashtags.map(({ hashtag }) => hashtag.name.replace(/^#/, '')),
    likeCount: content.likeCount,
    price: content.price,
    author: {
      name: content.user.nickname,
      urlname: content.user.urlname,
      imageUrl: emptyToNull(content.user.userProfileImagePath),
    },
    source: 'api',
  };
}

/**
 * 一覧 API のレスポンス（パース済みの JSON）を検証し、`NoteArticlePage` に変換する。
 * @throws {NoteSchemaError} 使うキーが欠けている・型が違うとき
 */
export function normalizeContentsPage(json: unknown, page: number): NoteArticlePage {
  const result = contentsResponseSchema.safeParse(json);
  if (!result.success) {
    throw new NoteSchemaError('Unexpected shape of the note article list response', {
      issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    });
  }
  const { data } = result.data;
  return {
    articles: data.contents.map(toSummary),
    page,
    totalCount: data.totalCount,
    isLastPage: data.isLastPage,
  };
}
