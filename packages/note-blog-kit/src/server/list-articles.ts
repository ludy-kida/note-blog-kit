import type { NoteArticlePage } from '../core/types.js';
import { fetchNoteJson, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeContentsPage } from './normalize/contents.js';
import { defaultThrottle } from './throttle.js';

/** {@link listArticles} のオプション */
export interface ListArticlesOptions {
  /** note のユーザー名（note.com/{user} の部分）。英数字・_・- のみ */
  user: string;
  /** ページ番号（1 始まり）。既定は 1。1ページは6件 */
  page?: number;
  /** fetch の差し替え（テストやキャッシュ層のため）。既定は globalThis.fetch */
  fetch?: typeof globalThis.fetch;
  /** 中断用のシグナル。中断したときはその理由をそのまま投げる */
  signal?: AbortSignal;
  /** タイムアウト（ミリ秒）。既定は 10000 */
  timeoutMs?: number;
  /** 同じプロセス内の連続リクエストの最小間隔（ミリ秒）。既定は 1000 */
  minIntervalMs?: number;
}

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_INTERVAL_MS = 1_000;

/**
 * 記事一覧の1ページを取得する（サーバー専用。note は CORS に対応していない）。
 *
 * @throws {TypeError} user・page が不正なとき
 * @throws {NoteNotFoundError} ユーザーが見つからないとき
 * @throws {NoteHttpError} その他の 2xx でないステータス
 * @throws {NoteNetworkError} 通信に失敗したとき
 * @throws {NoteTimeoutError} タイムアウトしたとき
 * @throws {NoteSchemaError} レスポンスの形が想定と違うとき
 */
export async function listArticles(options: ListArticlesOptions): Promise<NoteArticlePage> {
  const { user, page = 1 } = options;
  if (!USER_RE.test(user)) {
    throw new TypeError(`Invalid note user name: ${JSON.stringify(user)}`);
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new TypeError(`page must be a positive integer: ${page}`);
  }

  const url = `${NOTE_ORIGIN}/api/v2/creators/${encodeURIComponent(user)}/contents?kind=note&page=${page}`;
  await defaultThrottle(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
  const json = await fetchNoteJson(url, {
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal: options.signal,
  });
  return normalizeContentsPage(json, page);
}
