import { isNoteError } from '../server/errors.js';
import { type ListArticlesOptions, listArticles } from '../server/list-articles.js';
import { NOTE_USER_RE } from '../server/patterns.js';

/** `createNoteArticlesHandler` のオプション */
export interface NoteArticlesHandlerOptions extends Omit<ListArticlesOptions, 'page'> {
  /** `?page=` で受け付ける最大のページ番号。既定は 100（キャッシュにないページを取らせ続けられないように） */
  maxPage?: number;
  /** 成功した応答の `Cache-Control` の `s-maxage`（秒）。既定は 3600。`stale-while-revalidate` も同じ値 */
  cacheSeconds?: number;
}

const DEFAULT_MAX_PAGE = 100;
const DEFAULT_CACHE_SECONDS = 3600;

function json(body: unknown, status: number, cacheControl: string): Response {
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
 * `?page=N` でページを指定する（1〜maxPage）。成功した応答には CDN 向けのキャッシュヘッダーを付ける。
 * 失敗したときは、404 は 404、それ以外は 502 を `{ error: <NoteErrorCode> }` で返し、キャッシュさせない。
 *
 * @example
 * ```ts
 * // app/api/note/route.ts
 * export const GET = createNoteArticlesHandler({ user: 'your_urlname' });
 * ```
 * @throws {TypeError} user・maxPage・cacheSeconds が不正なとき（作るとき）
 */
export function createNoteArticlesHandler(
  options: NoteArticlesHandlerOptions,
): (request: Request) => Promise<Response> {
  const { maxPage = DEFAULT_MAX_PAGE, cacheSeconds = DEFAULT_CACHE_SECONDS, ...listOptions } = options;
  if (typeof listOptions.user !== 'string' || !NOTE_USER_RE.test(listOptions.user)) {
    throw new TypeError(`Invalid note user name: ${JSON.stringify(listOptions.user)}`);
  }
  assertInteger('maxPage', maxPage, 1);
  assertInteger('cacheSeconds', cacheSeconds, 0);
  const cacheControl = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`;

  return async (request) => {
    const raw = new URL(request.url).searchParams.get('page');
    const page = raw === null ? 1 : Number(raw);
    if (raw === '' || !Number.isInteger(page) || page < 1 || page > maxPage) {
      return json({ error: 'INVALID_PAGE' }, 400, 'no-store');
    }
    try {
      return json(await listArticles({ ...listOptions, page }), 200, cacheControl);
    } catch (error) {
      if (!isNoteError(error)) throw error;
      return json({ error: error.code }, error.code === 'NOTE_NOT_FOUND' ? 404 : 502, 'no-store');
    }
  };
}
