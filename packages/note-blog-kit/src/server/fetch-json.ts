/**
 * note への GET リクエストを送り、本文（テキスト・JSON）を返す（内部用）。
 * - 送信先は https://note.com に限る
 * - Cookie・認証情報を送らない。リダイレクトは追わない（別ホストへ誘導されないため）
 * - HTTP ステータス・通信失敗・タイムアウトを型付きエラーに変換する
 */
import { NoteHttpError, NoteNetworkError, NoteNotFoundError, NoteSchemaError, NoteTimeoutError } from './errors.js';

export const NOTE_ORIGIN = 'https://note.com';

/** 応答の長さの上限（文字数）。一覧・本文・RSS のどれも通常は数百 KB まで */
const MAX_BODY_LENGTH = 10_000_000;

export interface FetchJsonOptions {
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export interface FetchTextOptions extends FetchJsonOptions {
  /** Accept ヘッダー */
  accept: string;
}

/** note から取得し、2xx の本文をテキストで返す */
export async function fetchNoteText(url: string, options: FetchTextOptions): Promise<string> {
  if (new URL(url).origin !== NOTE_ORIGIN) {
    throw new TypeError(`Refusing to request a non-note.com URL: ${url}`);
  }
  // 間隔の制限で待っている間に中断された場合は、送信せずに理由を投げる
  options.signal?.throwIfAborted();

  // タイムアウトと利用者の中断を1つのシグナルにまとめる（AbortSignal.any は Node 20.3 以降のため使わない）
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Timed out after ${options.timeoutMs}ms`));
  }, options.timeoutMs);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let response: Response;
  let body: string;
  try {
    response = await options.fetch(url, {
      method: 'GET',
      headers: { Accept: options.accept },
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    body = await response.text();
  } catch (error) {
    // 利用者による中断は、その理由をそのまま投げる
    if (options.signal?.aborted) throw options.signal.reason;
    if (timedOut) {
      throw new NoteTimeoutError(`Request to note timed out after ${options.timeoutMs}ms: ${url}`, { cause: error });
    }
    throw new NoteNetworkError(`Request to note failed: ${url}`, { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  // 差し替えた fetch が redirect: 'error' を守らない場合に備え、応答元も確認する
  if (response.redirected || (response.url !== '' && new URL(response.url).origin !== NOTE_ORIGIN)) {
    throw new NoteNetworkError(`note redirected the request, which is not allowed: ${url}`);
  }
  if (response.status === 404) {
    throw new NoteNotFoundError(`Not found on note: ${url}`, { url });
  }
  if (!response.ok) {
    throw new NoteHttpError(`note responded with HTTP ${response.status}: ${url}`, { status: response.status, url });
  }

  // 想定より大きすぎる応答は、形が違うとみなす（解析に時間やメモリを使わせないため）
  if (body.length > MAX_BODY_LENGTH) {
    throw new NoteSchemaError('note returned a response that is too large', {
      issues: [{ path: '', message: `Response is longer than ${MAX_BODY_LENGTH} characters` }],
    });
  }
  return body;
}

/** note から取得し、2xx の本文を JSON として返す */
export async function fetchNoteJson(url: string, options: FetchJsonOptions): Promise<unknown> {
  const body = await fetchNoteText(url, { ...options, accept: 'application/json' });
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new NoteSchemaError('note returned a response that is not valid JSON', {
      issues: [{ path: '', message: 'Invalid JSON' }],
      cause: error,
    });
  }
}
