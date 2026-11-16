import type { NoteArticle } from '../core/types.js';
import { fetchNoteJson, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeNote } from './normalize/note.js';
import { assertMilliseconds, DEFAULT_MIN_INTERVAL_MS, DEFAULT_TIMEOUT_MS } from './request-options.js';
import { getDefaultThrottle } from './throttle.js';

/** {@link getArticle} のオプション */
export interface GetArticleOptions {
  /** 記事キー（例: n55256baa5425。記事 URL の /n/ の後ろ）。n と英小文字・数字のみ */
  key: string;
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
   * listArticles などと同じく、送信順はプロセス全体で1本の列にまとめられる。
   */
  minIntervalMs?: number;
}

const KEY_RE = /^n[0-9a-z]{1,32}$/;

/**
 * 記事1件を取得する（サーバー専用。note は CORS に対応していない）。
 * 本文（`bodyHtml`）はサニタイズ済み。有料記事は無料部分だけで、`isPartial` が true になる。
 *
 * note の API は記事キーだけで誰の記事でも返す。ページの URL から受け取ったキーをそのまま渡す場合は、
 * 他人の記事を表示しないよう、`article.author.urlname` が自分のユーザー名か確かめること。
 *
 * @throws {TypeError} key やオプションが不正なとき
 * @throws {NoteNotFoundError} 記事が見つからないとき
 * @throws {NoteHttpError} その他の 2xx でないステータス
 * @throws {NoteNetworkError} 通信に失敗したとき
 * @throws {NoteTimeoutError} タイムアウトしたとき
 * @throws {NoteSchemaError} レスポンスの形が想定と違うとき
 */
export async function getArticle(options: GetArticleOptions): Promise<NoteArticle> {
  const { key, timeoutMs = DEFAULT_TIMEOUT_MS, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, signal } = options;
  // 文字列への変換で値が変わるオブジェクトを受け付けないよう、型も確認する
  if (typeof key !== 'string' || !KEY_RE.test(key)) {
    throw new TypeError(`Invalid note article key: ${typeof key === 'string' ? JSON.stringify(key) : typeof key}`);
  }
  assertMilliseconds('timeoutMs', timeoutMs, 1);
  assertMilliseconds('minIntervalMs', minIntervalMs, 0);

  const url = `${NOTE_ORIGIN}/api/v3/notes/${key}`;
  await getDefaultThrottle()(minIntervalMs, signal);
  const json = await fetchNoteJson(url, { fetch: options.fetch ?? globalThis.fetch, timeoutMs, signal });
  return normalizeNote(json);
}
