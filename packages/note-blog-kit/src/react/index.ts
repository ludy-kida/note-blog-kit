/**
 * note-blog-kit/react: 見た目を持たない React コンポーネント。データを受け取って描画するだけで、取得はしない。
 * すべてフックを使わないため、Server Component としても使える。
 *
 * @packageDocumentation
 */

// props の型をこの entry だけで扱えるよう、公開型も再エクスポートする（型のみ。実行時のコードは増えない）
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
export { NoteArticleCard, type NoteArticleCardProps } from './NoteArticleCard.js';
export { NoteArticleList, type NoteArticleListProps } from './NoteArticleList.js';
export { NotePagination, type NotePaginationProps } from './NotePagination.js';
export type { NoteLinkComponent } from './types.js';
