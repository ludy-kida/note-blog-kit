/**
 * 一覧 API（/api/v2/creators/{user}/contents）のレスポンスを公開型に変換する。
 * 使うキーは fixtures/contents/*.json に実在するものだけ。未知のキーは無視する。
 */
import { z } from 'zod';
import type { NoteArticlePage, NoteArticleSummary } from '../../core/types.js';
import { NoteSchemaError } from '../errors.js';

const contentSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  noteUrl: z.string().min(1),
  publishAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '日時として解釈できません'),
  body: z.string(),
  eyecatch: z.string(),
  hashtags: z.array(z.object({ hashtag: z.object({ name: z.string() }) })),
  likeCount: z.number(),
  price: z.number(),
  user: z.object({
    nickname: z.string(),
    urlname: z.string(),
    userProfileImagePath: z.string(),
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
    throw new NoteSchemaError(
      '記事一覧のレスポンスの形が想定と違います',
      result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  const { data } = result.data;
  return {
    articles: data.contents.map(toSummary),
    page,
    totalCount: data.totalCount,
    isLastPage: data.isLastPage,
  };
}
