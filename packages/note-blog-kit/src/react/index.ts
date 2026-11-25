/**
 * note-blog-kit/react: 見た目を持たない React コンポーネント。データを受け取って描画するだけで、取得はしない。
 * `useNoteArticles`（Client Component・SPA 用のフック）以外はフックを使わないため、Server Component としても使える。
 *
 * @packageDocumentation
 */

// props の型をこの entry だけで扱えるよう、公開型も再エクスポートする（型のみ。実行時のコードは増えない）
export type {
  NoteArticle,
  NoteArticlePage,
  NoteArticleSummary,
  NoteArticlesHandlerErrorCode,
  NoteAuthor,
  NoteEmbed,
  NoteErrorCode,
  NoteEyecatch,
  NoteSource,
  NoteTocItem,
} from '../core/types.js';
export {
  NoteArticleBody,
  type NoteArticleBodyProps,
  type NoteBodyComponents,
  type NoteBodyEmbedProps,
  type NoteBodyHeadingProps,
  type NoteBodyImageProps,
  type NoteBodyTocProps,
} from './NoteArticleBody.js';
export { NoteArticleCard, type NoteArticleCardProps } from './NoteArticleCard.js';
export { NoteArticleList, type NoteArticleListProps } from './NoteArticleList.js';
export { NotePagination, type NotePaginationProps } from './NotePagination.js';
export type { NoteHeadingLevel, NoteLinkComponent } from './types.js';
export {
  type UseNoteArticlesError,
  type UseNoteArticlesOptions,
  type UseNoteArticlesResult,
  useNoteArticles,
} from './useNoteArticles.js';
