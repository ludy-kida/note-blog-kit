/** 取得関数に共通するオプションの型・既定値・検証 */

/** note から取得する関数（listArticles・getArticle など）に共通するオプション */
export interface NoteRequestOptions {
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

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MIN_INTERVAL_MS = 1_000;
/** setTimeout が扱える上限（これを超えると約 1ms に丸められ、待たなくなる） */
const MAX_TIMER_MS = 2 ** 31 - 1;

export function assertMilliseconds(name: string, value: number, min: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be a finite number between ${min} and ${MAX_TIMER_MS}: ${String(value)}`);
  }
}
