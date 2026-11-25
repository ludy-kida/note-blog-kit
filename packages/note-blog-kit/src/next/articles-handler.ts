import type { NoteArticlePage, NoteArticlesHandlerErrorBody } from '../core/types.js';
import { isNoteError } from '../server/errors.js';
import { type ListArticlesOptions, listArticles } from '../server/list-articles.js';
import { NOTE_USER_RE } from '../server/patterns.js';
import { assertMilliseconds } from '../server/request-options.js';

/** `createNoteArticlesHandler` のオプション（`page` はリクエストの `?page=` で指定する） */
export interface NoteArticlesHandlerOptions extends Omit<ListArticlesOptions, 'page'> {
  /**
   * `?page=` で受け付ける最大のページ番号。既定は 100（`source: 'rss'` では 1 で、1 より大きい値は渡せない）。
   * キャッシュにないページを取らせ続けられないように上限を設ける
   */
  maxPage?: number;
  /** 成功した応答の `Cache-Control` の `s-maxage`（秒）。既定は 3600。`stale-while-revalidate` も同じ値 */
  cacheSeconds?: number;
}

const DEFAULT_MAX_PAGE_NUMBER = 100;
const DEFAULT_CACHE_SECONDS = 3600;
/** 正規形のページ番号だけを受け付ける（01・1.0・1e0 などで CDN のキャッシュを外させない） */
const PAGE_RE = /^[1-9][0-9]{0,5}$/;
const SOURCES = new Set(['api', 'rss', 'auto']);

function json(body: NoteArticlePage | NoteArticlesHandlerErrorBody, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl },
  });
}

function assertInteger(name: string, value: number, min: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new TypeError(`${name} must be an integer of ${min} or more: ${String(value)}`);
  }
}

/**
 * 記事一覧を返す中継エンドポイント（Next.js App Router の Route Handler など）を作る（サーバー専用）。
 * ブラウザ（`useNoteArticles` など）はここから取得し、note へは直接アクセスしない。
 *
 * - `?page=N`（1〜maxPage、正規形の整数のみ。省略すると 1）でページを指定する。ほかのクエリは受け付けない
 * - 成功：200 で `NoteArticlePage` を返し、`Cache-Control: public, s-maxage=<cacheSeconds>, stale-while-revalidate=<cacheSeconds>` を付ける
 * - 失敗（どれもキャッシュさせない `no-store`。本文は `NoteArticlesHandlerErrorBody`（`{ error: <コード> }`）だけで詳細は出さない）：
 *   400 `INVALID_REQUEST`（page・クエリが不正）／404 `NOTE_NOT_FOUND`／502 そのほかの `NoteErrorCode`／500 `INTERNAL_ERROR`
 * - リクエストが中断されたら（`request.signal`）、note への取得も中断する
 *
 * @example
 * ```ts
 * // app/api/note/route.ts
 * export const GET = createNoteArticlesHandler({ user: 'your_urlname' });
 * ```
 * @throws {TypeError} オプションが不正なとき（作るとき）
 */
export function createNoteArticlesHandler(
  options: NoteArticlesHandlerOptions,
): (request: Request) => Promise<Response> {
  const { maxPage: rawMax, cacheSeconds = DEFAULT_CACHE_SECONDS, ...listOptions } = options;
  const { user, source = 'api', timeoutMs, minIntervalMs } = listOptions;
  if (typeof user !== 'string' || !NOTE_USER_RE.test(user)) {
    throw new TypeError(`Invalid note user name: ${JSON.stringify(user)}`);
  }
  if (typeof source !== 'string' || !SOURCES.has(source)) {
    throw new TypeError(`source must be 'api', 'rss' or 'auto': ${String(source)}`);
  }
  if (timeoutMs !== undefined) assertMilliseconds('timeoutMs', timeoutMs, 1);
  if (minIntervalMs !== undefined) assertMilliseconds('minIntervalMs', minIntervalMs, 0);
  const maxPage = rawMax ?? (source === 'rss' ? 1 : DEFAULT_MAX_PAGE_NUMBER);
  assertInteger('maxPage', maxPage, 1);
  if (source === 'rss' && maxPage !== 1) {
    throw new TypeError(`The RSS has only one page, so maxPage must be 1: ${maxPage}`);
  }
  assertInteger('cacheSeconds', cacheSeconds, 0);
  const cacheControl = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`;

  return async (request) => {
    const params = new URL(request.url).searchParams;
    const raw = params.get('page');
    const keys = [...params.keys()];
    const page = raw === null ? 1 : Number(raw);
    if (
      keys.some((key) => key !== 'page') ||
      keys.length > 1 ||
      (raw !== null && !PAGE_RE.test(raw)) ||
      page > maxPage
    ) {
      return json({ error: 'INVALID_REQUEST' }, 400, 'no-store');
    }
    const signal = options.signal ? AbortSignal.any([options.signal, request.signal]) : request.signal;
    try {
      return json(await listArticles({ ...listOptions, page, signal }), 200, cacheControl);
    } catch (error) {
      if (isNoteError(error)) {
        return json({ error: error.code }, error.code === 'NOTE_NOT_FOUND' ? 404 : 502, 'no-store');
      }
      if (request.signal.aborted) throw error;
      return json({ error: 'INTERNAL_ERROR' }, 500, 'no-store');
    }
  };
}
