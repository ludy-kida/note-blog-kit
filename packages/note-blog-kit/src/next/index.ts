/**
 * note-blog-kit/next: Next.js（App Router）向けヘルパー（サーバー専用）。
 * `next` には依存せず、Next.js の `Metadata`・`generateStaticParams` にそのまま渡せる値を作る。
 *
 * @packageDocumentation
 */

// 引数・戻り値の型をこの entry だけで扱えるよう、参照する公開型も再エクスポートする（型のみ）
export type {
  NoteArticle,
  NoteArticleSummary,
  NoteArticlesHandlerErrorBody,
  NoteArticlesHandlerErrorCode,
  NoteAuthor,
  NoteEmbed,
  NoteErrorCode,
  NoteEyecatch,
  NoteSource,
  NoteTocItem,
} from '../core/types.js';
export type { IterateArticlesOptions } from '../server/iterate-articles.js';
export type { ListArticlesOptions, NoteSourceOption } from '../server/list-articles.js';
export type { NoteRequestOptions } from '../server/request-options.js';
export { createNoteArticlesHandler, type NoteArticlesHandlerOptions } from './articles-handler.js';
export {
  type GenerateNoteMetadataOptions,
  generateNoteMetadata,
  type NoteMetadata,
  type NoteMetadataImage,
} from './metadata.js';
export { type GenerateNoteStaticParamsOptions, generateNoteStaticParams } from './static-params.js';
