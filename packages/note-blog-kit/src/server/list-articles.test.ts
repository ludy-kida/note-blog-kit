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

  it('タイムアウトの既定値は 10 秒', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (...[, init]: FetchArgs) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const settled = vi.fn();
    const promise = listArticles({ ...base, fetch }).catch((e: unknown) => {
      settled(e);
      return e;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toBeInstanceOf(NoteTimeoutError);
  });

  it('リダイレクトされた応答は NoteNetworkError（差し替えた fetch が redirect を守らない場合）', async () => {
    const fetch = mockFetch(() => {
      const response = new Response(fixture(1));
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    await expect(listArticles({ ...base, fetch })).rejects.toBeInstanceOf(NoteNetworkError);
  });

  it('timeoutMs・minIntervalMs が範囲外なら TypeError', async () => {
    const fetch = mockFetch();
    for (const options of [
      { timeoutMs: 0 },
      { timeoutMs: -1 },
      { timeoutMs: Number.NaN },
      { timeoutMs: Number.POSITIVE_INFINITY },
      { minIntervalMs: -1 },
      { minIntervalMs: Number.NaN },
      { minIntervalMs: 2 ** 31 },
    ]) {
      await expect(listArticles({ minIntervalMs: 0, ...options, user: 'kida_lw', fetch })).rejects.toBeInstanceOf(
        TypeError,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('文字列でない user は TypeError（文字列への変換で値が変わるオブジェクトを拒否する）', async () => {
    const fetch = mockFetch();
    const tricky = { toString: () => 'kida_lw' } as unknown as string;
    await expect(listArticles({ ...base, user: tricky, fetch })).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('同じプロセス内の連続リクエストは既定で 1 秒空ける', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    // 既定の制限は globalThis で共有されるため、前のテストの送信時刻を消してから始める
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('note-blog-kit.throttle')];
    const freshListArticles = listArticles;
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

const rssFeed = readFileSync(new URL('../../../../fixtures/rss/feed.xml', import.meta.url), 'utf8');

/** API は respondApi、RSS は fixture を返すモックの fetch */
function routedFetch(respondApi: () => Response | Promise<Response>) {
  return vi.fn(async (...[input]: FetchArgs) => {
    const url = new URL(String(input));
    return url.pathname === '/kida_lw/rss' ? new Response(rssFeed) : respondApi();
  });
}

const urls = (fetch: ReturnType<typeof routedFetch>) =>
  fetch.mock.calls.map(([input]) => new URL(String(input)).pathname);

describe('listArticles の source', () => {
  it("既定は 'api'", async () => {
    const fetch = routedFetch(() => new Response(fixture(1)));
    const result = await listArticles({ ...base, fetch });
    expect(urls(fetch)).toEqual(['/api/v2/creators/kida_lw/contents']);
    expect(result.articles[0]?.source).toBe('api');
  });

  it("'rss' は RSS を取得し、1ページだけを返す", async () => {
    const fetch = routedFetch(() => new Response(fixture(1)));
    const result = await listArticles({ ...base, source: 'rss', fetch });
    expect(urls(fetch)).toEqual(['/kida_lw/rss']);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('accept')).toContain('application/rss+xml');
    expect(result).toMatchObject({ page: 1, totalCount: null, isLastPage: true });
    expect(result.articles).toHaveLength(25);
    expect(result.articles.every((a) => a.source === 'rss')).toBe(true);
  });

  it("'rss' で page が 2 以上・不明な source は TypeError で、fetch しない", async () => {
    const fetch = routedFetch(() => new Response(fixture(1)));
    await expect(listArticles({ ...base, source: 'rss', page: 2, fetch })).rejects.toBeInstanceOf(TypeError);
    await expect(listArticles({ ...base, source: 'xml' as unknown as 'rss', fetch })).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("'auto' は API が 404・5xx・形の違いで失敗したら RSS に切り替える", async () => {
    for (const respond of [
      () => new Response('{"data":"not found"}', { status: 404 }),
      () => new Response('oops', { status: 503 }),
      () => new Response('{"data":{"contents":"x"}}'),
      () => new Response('<html>maintenance</html>'),
    ]) {
      const fetch = routedFetch(respond);
      const result = await listArticles({ ...base, source: 'auto', fetch });
      expect(urls(fetch)).toEqual(['/api/v2/creators/kida_lw/contents', '/kida_lw/rss']);
      expect(result.articles[0]?.source).toBe('rss');
      expect(result.isLastPage).toBe(true);
    }
  });

  it("'auto' は API が成功すれば RSS を取得しない", async () => {
    const fetch = routedFetch(() => new Response(fixture(1)));
    const result = await listArticles({ ...base, source: 'auto', fetch });
    expect(urls(fetch)).toEqual(['/api/v2/creators/kida_lw/contents']);
    expect(result.articles[0]?.source).toBe('api');
  });

  it("'auto' でも 4xx（404 以外）・タイムアウト・2ページ目の失敗では切り替えない", async () => {
    const forbidden = routedFetch(() => new Response('no', { status: 403 }));
    await expect(listArticles({ ...base, source: 'auto', fetch: forbidden })).rejects.toBeInstanceOf(NoteHttpError);
    expect(urls(forbidden)).toEqual(['/api/v2/creators/kida_lw/contents']);

    const hanging = vi.fn(
      (...[, init]: FetchArgs) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    await expect(listArticles({ ...base, source: 'auto', timeoutMs: 20, fetch: hanging })).rejects.toBeInstanceOf(
      NoteTimeoutError,
    );
    expect(hanging).toHaveBeenCalledTimes(1);

    const secondPage = routedFetch(() => new Response('oops', { status: 503 }));
    await expect(listArticles({ ...base, source: 'auto', page: 2, fetch: secondPage })).rejects.toBeInstanceOf(
      NoteHttpError,
    );
    expect(urls(secondPage)).toEqual(['/api/v2/creators/kida_lw/contents']);
  });

  it('大きすぎる応答は NoteSchemaError', async () => {
    const fetch = routedFetch(() => new Response(' '.repeat(10_000_001)));
    await expect(listArticles({ ...base, fetch })).rejects.toBeInstanceOf(NoteSchemaError);
  });
});
