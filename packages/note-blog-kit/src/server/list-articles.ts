import type { NoteArticlePage } from '../core/types.js';
import { isNoteError } from './errors.js';
import { fetchNoteJson, fetchNoteText, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeContentsPage } from './normalize/contents.js';
import { normalizeRss } from './normalize/rss.js';
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
  /** ページ番号（1 始まり）。既定は 1。1ページは6件（RSS は1ページのみ） */
  page?: number;
  /**
   * 取得元。既定は `'api'`。
   * - `'rss'`：RSS（最新25件・1ページのみ）。`hashtags` は空、`likeCount`・`price`・`totalCount` は null。`page` は 1 だけ
   * - `'auto'`：API で取得し、404・5xx・形の違い（NoteSchemaError）で失敗したら RSS に切り替える。
   *   切り替えるのは1ページ目だけ。タイムアウト・通信の失敗・中断では切り替えない
   */
  source?: 'api' | 'rss' | 'auto';
}

const SOURCES = new Set(['api', 'rss', 'auto']);

/** 'auto' で RSS に切り替える失敗か（API の形が変わった・なくなった・落ちている） */
function shouldFallBack(error: unknown): boolean {
  if (!isNoteError(error)) return false;
  return (
    error.code === 'NOTE_NOT_FOUND' ||
    error.code === 'NOTE_SCHEMA_ERROR' ||
    (error.code === 'NOTE_HTTP_ERROR' && error.status >= 500)
  );
}

/**
 * 記事一覧の1ページを取得する（サーバー専用。note は CORS に対応していない）。
 *
 * @throws {TypeError} user・page・source が不正なとき（`source: 'rss'` で page が 2 以上を含む）
 * @throws {NoteNotFoundError} ユーザーが見つからないとき
 * @throws {NoteHttpError} その他の 2xx でないステータス
 * @throws {NoteNetworkError} 通信に失敗したとき
 * @throws {NoteTimeoutError} タイムアウトしたとき
 * @throws {NoteSchemaError} レスポンスの形が想定と違うとき
 */
export async function listArticles(options: ListArticlesOptions): Promise<NoteArticlePage> {
  const {
    user,
    page = 1,
    source = 'api',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    signal,
  } = options;
  // 文字列への変換で値が変わるオブジェクトを受け付けないよう、型も確認する
  if (typeof user !== 'string' || !NOTE_USER_RE.test(user)) {
    throw new TypeError(`Invalid note user name: ${typeof user === 'string' ? JSON.stringify(user) : typeof user}`);
  }
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
    throw new TypeError(`page must be a positive integer: ${typeof page === 'number' ? page : typeof page}`);
  }
  if (typeof source !== 'string' || !SOURCES.has(source)) {
    throw new TypeError(`source must be 'api', 'rss' or 'auto': ${String(source)}`);
  }
  if (source === 'rss' && page !== 1) {
    throw new TypeError(`The RSS has only one page: ${page}`);
  }
  assertMilliseconds('timeoutMs', timeoutMs, 1);
  assertMilliseconds('minIntervalMs', minIntervalMs, 0);

  const request = { fetch: options.fetch ?? globalThis.fetch, timeoutMs, signal };
  const fromRss = async (): Promise<NoteArticlePage> => {
    await getDefaultThrottle()(minIntervalMs, signal);
    const xml = await fetchNoteText(`${NOTE_ORIGIN}/${encodeURIComponent(user)}/rss`, {
      ...request,
      accept: 'application/rss+xml, application/xml;q=0.9',
    });
    return normalizeRss(xml, user);
  };
  if (source === 'rss') return fromRss();

  try {
    const url = `${NOTE_ORIGIN}/api/v2/creators/${encodeURIComponent(user)}/contents?kind=note&page=${page}`;
    await getDefaultThrottle()(minIntervalMs, signal);
    return normalizeContentsPage(await fetchNoteJson(url, request), page);
  } catch (error) {
    if (source === 'auto' && page === 1 && shouldFallBack(error)) return fromRss();
    throw error;
  }
}
