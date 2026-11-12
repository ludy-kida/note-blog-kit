/**
 * note への GET リクエストを送り、JSON を返す（内部用）。
 * - 送信先は https://note.com に限る
 * - Cookie・認証情報を送らない。リダイレクトは追わない（別ホストへ誘導されないため）
 * - HTTP ステータス・通信失敗・タイムアウトを型付きエラーに変換する
 */
import { NoteHttpError, NoteNetworkError, NoteNotFoundError, NoteSchemaError, NoteTimeoutError } from './errors.js';

export const NOTE_ORIGIN = 'https://note.com';

export interface FetchJsonOptions {
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export async function fetchNoteJson(url: string, options: FetchJsonOptions): Promise<unknown> {
  if (new URL(url).origin !== NOTE_ORIGIN) {
    throw new TypeError(`Refusing to request a non-note.com URL: ${url}`);
  }

  // 間隔の制限で待っている間に中断された場合は、送信せずに理由を投げる
  options.signal?.throwIfAborted();

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal === undefined ? timeoutSignal : AbortSignal.any([options.signal, timeoutSignal]);

  let response: Response;
  let body: string;
  try {
    response = await options.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      signal,
    });
    body = await response.text();
  } catch (error) {
    // 利用者による中断は、その理由をそのまま投げる
    if (options.signal?.aborted) throw options.signal.reason;
    if (timeoutSignal.aborted) {
      throw new NoteTimeoutError(`Request to note timed out after ${options.timeoutMs}ms: ${url}`, { cause: error });
    }
    throw new NoteNetworkError(`Request to note failed: ${url}`, { cause: error });
  }

  if (response.status === 404) {
    throw new NoteNotFoundError(`Not found on note: ${url}`);
  }
  if (!response.ok) {
    throw new NoteHttpError(`note responded with HTTP ${response.status}: ${url}`, { status: response.status, url });
  }

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new NoteSchemaError('note returned a response that is not valid JSON', {
      issues: [{ path: '', message: 'Invalid JSON' }],
      cause: error,
    });
  }
}
