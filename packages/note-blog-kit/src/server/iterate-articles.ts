import type { NoteArticleSummary } from '../core/types.js';
import { type ListArticlesOptions, listArticles } from './list-articles.js';

/** {@link iterateArticles}・{@link listAllArticles} のオプション。`listArticles` のオプションから `page` を除いたもの */
export interface IterateArticlesOptions extends Omit<ListArticlesOptions, 'page'> {
  /** 取得する最大ページ数（1 以上の整数）。既定は 20（1ページ6件なので120件） */
  maxPages?: number;
}

/** 全件取得の結果のうち、記事以外の情報 */
export interface IterateArticlesResult {
  /** maxPages に達して打ち切ったとき true（続きのページがある可能性がある） */
  truncated: boolean;
  /** 最後に取得したページの totalCount */
  totalCount: number | null;
  /** 実際に取得したページ数 */
  pages: number;
}

/** {@link listAllArticles} の結果 */
export interface ListAllArticlesResult extends IterateArticlesResult {
  /** 取得した記事（新しい順、key で重複を除いたもの） */
  articles: NoteArticleSummary[];
}

const DEFAULT_MAX_PAGES = 20;

/**
 * 記事を新しい順に1件ずつ返す（サーバー専用）。最終ページか maxPages に達したら終わる。
 * ページの取得には `listArticles` を使うため、取得間隔の制限・タイムアウト・中断もそのまま効く。
 * 取得中にページがずれて同じ記事が再び出た場合は、`key` で重複を除く。
 *
 * 打ち切りの有無などはジェネレーターの戻り値（`IterateArticlesResult`）で返す。
 * `for await` ではこの戻り値を受け取れないため、必要なら {@link listAllArticles} を使うか `next()` を手で回す。
 *
 * @throws {TypeError} maxPages などが不正なとき（呼び出した時点ではなく、最初の `next()` で投げる）
 * @throws 途中のページの取得で起きたエラー（それまでに返した記事はそのまま）
 */
export async function* iterateArticles(
  options: IterateArticlesOptions,
): AsyncGenerator<NoteArticleSummary, IterateArticlesResult, undefined> {
  const { maxPages = DEFAULT_MAX_PAGES, ...listOptions } = options;
  if (typeof maxPages !== 'number' || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new TypeError(
      `maxPages must be a positive integer: ${typeof maxPages === 'number' ? maxPages : typeof maxPages}`,
    );
  }

  const seen = new Set<string>();
  let totalCount: number | null = null;
  let pages = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await listArticles({ ...listOptions, page });
    pages = page;
    totalCount = result.totalCount;
    for (const article of result.articles) {
      if (seen.has(article.key)) continue;
      seen.add(article.key);
      yield article;
    }
    // 最終ページ、または記事が0件のページで終わる（isLastPage が来なくても無限に取りに行かない）
    if (result.isLastPage || result.articles.length === 0) {
      return { truncated: false, totalCount, pages };
    }
  }
  return { truncated: true, totalCount, pages };
}

/**
 * 全件（maxPages まで。既定は 20 ページ）を配列で返す（サーバー専用）。
 * `truncated` が true なら maxPages で打ち切っており、続きのページがある可能性がある。
 *
 * @throws {TypeError} maxPages などが不正なとき
 * @throws 途中のページの取得で起きたエラー。それまでに集めた記事は返らない
 *   （途中までの記事も使いたい場合は {@link iterateArticles} を使う）
 */
export async function listAllArticles(options: IterateArticlesOptions): Promise<ListAllArticlesResult> {
  const articles: NoteArticleSummary[] = [];
  const iterator = iterateArticles(options);
  let step = await iterator.next();
  while (!step.done) {
    articles.push(step.value);
    step = await iterator.next();
  }
  return { articles, ...step.value };
}
