/**
 * note-blog-kit/server: note からの取得（サーバー専用。note は CORS に対応していない）。
 *
 * @packageDocumentation
 */

// 戻り値の型をこの entry だけで扱えるよう、公開型も再エクスポートする（型のみ。実行時のコードは増えない）
export type {
  NoteArticle,
  NoteArticlePage,
  NoteArticleSummary,
  NoteAuthor,
  NoteEmbed,
  NoteEyecatch,
  NoteSource,
  NoteTocItem,
} from '../core/types.js';
export {
  type AnyNoteError,
  isNoteError,
  NoteError,
  type NoteErrorCode,
  type NoteErrorOptions,
  NoteHttpError,
  NoteNetworkError,
  NoteNotFoundError,
  NoteSchemaError,
  type NoteSchemaIssue,
  NoteTimeoutError,
} from './errors.js';
export { type ListArticlesOptions, listArticles } from './list-articles.js';
