import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isNoteError,
  NoteHttpError,
  NoteNetworkError,
  NoteNotFoundError,
  NoteSchemaError,
  NoteTimeoutError,
} from './errors.js';
import { listArticles } from './list-articles.js';

const fixture = (page: number): string =>
  readFileSync(new URL(`../../../../fixtures/contents/page-${page}.json`, import.meta.url), 'utf8');

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

/** fixture を返すモックの fetch。実 API にはアクセスしない */
function mockFetch(respond: (url: string) => Response | Promise<Response> = () => new Response(fixture(1))) {
  return vi.fn(async (...[input]: FetchArgs) => respond(String(input)));
}

/** 間隔の制限を受けないよう、既定では minIntervalMs: 0 で呼ぶ */
const base = { user: 'kida_lw', minIntervalMs: 0 } as const;

describe('listArticles', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('記事一覧を取得して NoteArticlePage を返す', async () => {
    const fetch = mockFetch(() => new Response(fixture(2), { headers: { 'content-type': 'application/json' } }));
    const result = await listArticles({ ...base, page: 2, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://note.com/api/v2/creators/kida_lw/contents?kind=note&page=2');
    expect(result.page).toBe(2);
    expect(result.articles).toHaveLength(6);
    expect(result.articles[0]?.source).toBe('api');
  });

  it('page の既定値は 1', async () => {
    const fetch = mockFetch();
    const result = await listArticles({ ...base, fetch });
    expect(fetch.mock.calls[0]?.[0]).toContain('&page=1');
    expect(result.page).toBe(1);
  });

  it('Cookie・認証情報を送らない', async () => {
    const fetch = mockFetch();
    await listArticles({ ...base, fetch });
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    const headers = new Headers(init?.headers);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
  });

  it('404 は NoteNotFoundError', async () => {
    const fetch = mockFetch(() => new Response('{"data":"not found"}', { status: 404 }));
    const error = await listArticles({ ...base, fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteNotFoundError);
    expect(isNoteError(error) && error.code).toBe('NOTE_NOT_FOUND');
  });

  it('その他の非 2xx は NoteHttpError（status を持つ）', async () => {
    const fetch = mockFetch(() => new Response('oops', { status: 503 }));
    const error = await listArticles({ ...base, fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteHttpError);
    expect((error as NoteHttpError).status).toBe(503);
    expect((error as NoteHttpError).url).toContain('/api/v2/creators/kida_lw/contents');
  });

  it('fetch 自体の失敗は NoteNetworkError（cause を保持）', async () => {
    const cause = new TypeError('fetch failed');
    const fetch = vi.fn(async () => {
      throw cause;
    });
    const error = await listArticles({ ...base, fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteNetworkError);
    expect((error as NoteNetworkError).cause).toBe(cause);
  });

  it('タイムアウトは NoteTimeoutError', async () => {
    // 送信時の signal が中断されるまで応答しない fetch
    const fetch = vi.fn(
      (...[, init]: FetchArgs) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const error = await listArticles({ ...base, fetch, timeoutMs: 20 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteTimeoutError);
  });

  it('利用者の signal で中断したら、その理由をそのまま投げる', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled by user');
    const fetch = vi.fn(
      (...[, init]: FetchArgs) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const promise = listArticles({ ...base, fetch, signal: controller.signal }).catch((e: unknown) => e);
    controller.abort(reason);
    const error = await promise;
    expect(error).toBe(reason);
    expect(isNoteError(error)).toBe(false);
  });

  it('JSON として壊れたレスポンスは NoteSchemaError', async () => {
    const fetch = mockFetch(() => new Response('<html>maintenance</html>', { status: 200 }));
    await expect(listArticles({ ...base, fetch })).rejects.toBeInstanceOf(NoteSchemaError);
  });

  it('形が想定と違うレスポンスは NoteSchemaError', async () => {
    const fetch = mockFetch(() => new Response('{"data":{"contents":"x"}}'));
    await expect(listArticles({ ...base, fetch })).rejects.toBeInstanceOf(NoteSchemaError);
  });

  it('不正な user・page は TypeError で、fetch を呼ばない', async () => {
    const fetch = mockFetch();
    for (const options of [
      { user: '../x' },
      { user: '' },
      { user: 'a b' },
      { user: 'kida_lw', page: 0 },
      { user: 'kida_lw', page: 1.5 },
      { user: 'kida_lw', page: Number.NaN },
    ]) {
      await expect(listArticles({ ...options, fetch, minIntervalMs: 0 })).rejects.toBeInstanceOf(TypeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('同じプロセス内の連続リクエストは既定で 1 秒空ける', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.resetModules();
    // モジュール単位の状態をリセットするため読み込み直す
    const { listArticles: freshListArticles } = await import('./list-articles.js');
    const sentAt: number[] = [];
    const fetch = mockFetch(() => {
      sentAt.push(Date.now());
      return new Response(fixture(1));
    });
    const first = freshListArticles({ user: 'kida_lw', fetch });
    const second = freshListArticles({ user: 'kida_lw', page: 2, fetch });
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([first, second]);
    expect(sentAt).toEqual([10_000, 11_000]);
  });
});
