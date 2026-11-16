/**
 * 一覧 API（/api/v2/creators/{user}/contents）のレスポンスを公開型に変換する。
 * 使うキーは fixtures/contents/*.json に実在するものだけ。未知のキーは無視する。
 */
import { z } from 'zod';
import type { NoteArticlePage, NoteArticleSummary } from '../../core/types.js';
import { NoteSchemaError } from '../errors.js';
import { emptyToNull, httpsUrl, optionalHttpsUrl } from './shared.js';

const contentSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  noteUrl: httpsUrl,
  publishAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), '日時として解釈できません'),
  body: z.string(),
  // 見出し画像のない記事は null になる（実データで確認。fixture には例がない）
  eyecatch: optionalHttpsUrl.nullable(),
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

function toSummary(content: RawContent): NoteArticleSummary {
  return {
    key: content.key,
    title: content.name,
    url: content.noteUrl,
    publishedAt: new Date(content.publishAt).toISOString(),
    excerpt: content.body.trim(),
    eyecatchUrl: content.eyecatch === null ? null : emptyToNull(content.eyecatch),
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
