import type { NoteArticlePage } from '../core/types.js';
import { fetchNoteJson, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeContentsPage } from './normalize/contents.js';
import { NOTE_USER_RE } from './patterns.js';
import {
  assertMilliseconds,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  type NoteRequestOptions,
} from './request-options.js';
import { getDefaultThrottle } from './throttle.js';

/** `listArticles` のオプション（`note-blog-kit/next` からも参照するため @link は使わない） */
export interface ListArticlesOptions extends NoteRequestOptions {
  /** note のユーザー名（note.com/{user} の部分）。英数字・_・- のみ */
  user: string;
  /** ページ番号（1 始まり）。既定は 1。1ページは6件 */
  page?: number;
}

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
  const { user, page = 1, timeoutMs = DEFAULT_TIMEOUT_MS, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, signal } = options;
  // 文字列への変換で値が変わるオブジェクトを受け付けないよう、型も確認する
  if (typeof user !== 'string' || !NOTE_USER_RE.test(user)) {
    throw new TypeError(`Invalid note user name: ${typeof user === 'string' ? JSON.stringify(user) : typeof user}`);
  }
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
    throw new TypeError(`page must be a positive integer: ${typeof page === 'number' ? page : typeof page}`);
  }
  assertMilliseconds('timeoutMs', timeoutMs, 1);
  assertMilliseconds('minIntervalMs', minIntervalMs, 0);

  const url = `${NOTE_ORIGIN}/api/v2/creators/${encodeURIComponent(user)}/contents?kind=note&page=${page}`;
  await getDefaultThrottle()(minIntervalMs, signal);
  const json = await fetchNoteJson(url, { fetch: options.fetch ?? globalThis.fetch, timeoutMs, signal });
  return normalizeContentsPage(json, page);
}
