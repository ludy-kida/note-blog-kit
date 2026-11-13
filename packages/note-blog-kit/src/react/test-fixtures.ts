/**
 * React のテスト用に、fixture から NoteArticleSummary を作る（テスト専用。公開しない）。
 * /react の実装コードはこのファイルも /server も import しないこと。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { NoteArticleSummary } from '../core/types.js';
import { normalizeContentsPage } from '../server/normalize/contents.js';

/**
 * リポジトリのルート（pnpm-workspace.yaml のある場所）を探す。
 * happy-dom 環境では import.meta.url がファイルの URL にならないため、作業ディレクトリから探す。
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('リポジトリのルートが見つかりません');
    dir = parent;
  }
  return dir;
}

export function loadArticles(page = 1): NoteArticleSummary[] {
  const json: unknown = JSON.parse(
    readFileSync(join(findRepoRoot(), 'fixtures', 'contents', `page-${page}.json`), 'utf8'),
  );
  return normalizeContentsPage(json, page).articles;
}

export function findArticle(key: string): NoteArticleSummary {
  const article = [1, 2, 3].flatMap((page) => loadArticles(page)).find((item) => item.key === key);
  if (article === undefined) throw new Error(`fixture に ${key} がありません`);
  return article;
}

/** 無料記事（見出し画像・抜粋・ハッシュタグあり） */
export const FREE_KEY = 'n55256baa5425';
/** 有料記事（980円） */
export const PAID_KEY = 'n52a7f4fa0a2e';
