import type { NoteArticlePage } from '../core/types.js';
import { fetchNoteJson, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeContentsPage } from './normalize/contents.js';
import { getDefaultThrottle } from './throttle.js';

/** {@link listArticles} のオプション */
export interface ListArticlesOptions {
  /** note のユーザー名（note.com/{user} の部分）。英数字・_・- のみ */
  user: string;
  /** ページ番号（1 始まり）。既定は 1。1ページは6件 */
  page?: number;
  /**
   * fetch の差し替え（テストやキャッシュ層のため）。既定は globalThis.fetch。
   * 差し替えた fetch でも Cookie・認証ヘッダーを付けないこと（note の公開情報だけを取得する前提）
   */
  fetch?: typeof globalThis.fetch;
  /** 中断用のシグナル。間隔の制限で待っている間も含め、中断したらすぐにその理由をそのまま投げる */
  signal?: AbortSignal;
  /** タイムアウト（ミリ秒）。1〜2147483647。既定は 10000 */
  timeoutMs?: number;
  /**
   * 連続リクエストの最小間隔（ミリ秒）。0〜2147483647。既定は 1000。
   * 送信順はプロセス全体（ESM・CJS の併用やパッケージの重複を含む）で1本の列にまとめられ、
   * この呼び出しは「直前の送信から minIntervalMs 経つまで」待ってから送られる。
   */
  minIntervalMs?: number;
}

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_INTERVAL_MS = 1_000;
/** setTimeout が扱える上限（これを超えると約 1ms に丸められ、待たなくなる） */
const MAX_TIMER_MS = 2 ** 31 - 1;

function assertMilliseconds(name: string, value: number, min: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be a finite number between ${min} and ${MAX_TIMER_MS}: ${String(value)}`);
  }
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
  if (typeof user !== 'string' || !USER_RE.test(user)) {
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
