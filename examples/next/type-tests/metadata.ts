/**
 * `note-blog-kit/next` の `NoteMetadata` を Next.js の `Metadata` に代入できることを確かめる型テスト（#50）。
 * `tsc -p tsconfig.type-tests.json` で確かめる（`scripts/build-examples.mjs` と CI の Next 15 のジョブで実行）。
 * `note-blog-kit` はビルド済みの型（dist）で解決するので、利用者と同じ見え方になる。
 */
import type { Metadata } from 'next';
import type { NoteArticle } from 'note-blog-kit';
import { generateNoteMetadata, type NoteMetadata } from 'note-blog-kit/next';

declare const article: NoteArticle;

// 結果をそのまま Metadata として使える
const metadata: Metadata = generateNoteMetadata(article, { formatTitle: (title) => `${title} | ブログ` });

// generateMetadata の戻り値として返せる
export async function generateMetadata(): Promise<Metadata> {
  return generateNoteMetadata(article);
}

// NoteMetadata 型そのものが Metadata に代入できる（項目を足しても壊れない）
type Assignable<T, U> = T extends U ? true : false;
const assignable: Assignable<NoteMetadata, Metadata> = true;

export { assignable, metadata };
