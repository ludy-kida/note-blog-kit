// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteArticlePage } from '../core/types.js';
import { loadArticles } from './test-fixtures.js';
import { useNoteArticles } from './useNoteArticles.js';

afterEach(cleanup);

const articles = loadArticles(1);
const page: NoteArticlePage = { articles, page: 2, totalCount: 237, isLastPage: false, source: 'api' };
// version のない古い articles.json（v0.3 まで）
const syncJson = { user: 'kida_lw', syncedAt: '2026-11-24T00:00:00.000Z', truncated: false, articles };

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(
    async (..._args: [input: string | URL | Request, init?: RequestInit]) =>
      new Response(JSON.stringify(body), { status }),
  );

describe('useNoteArticles', () => {
  it('中継エンドポイントの NoteArticlePage を取得する（取得中 → 成功）', async () => {
    const fetch = jsonFetch(page);
    const { result } = renderHook(() => useNoteArticles({ url: '/api/note?page=2', fetch }));
    expect(result.current).toMatchObject({ articles: [], data: null, isLoading: true, error: null });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.articles).toHaveLength(6);
    expect(result.current.data).toEqual(page);
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/note?page=2');
    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('same-origin');
  });

  it('CLI sync の articles.json も読める（1ページとして扱う）', async () => {
    const fetch = jsonFetch(syncJson);
    const { result } = renderHook(() => useNoteArticles({ url: '/note/articles.json', fetch }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.articles).toHaveLength(6);
    // articles.json はページ情報を持たないので、取得元は記事の source で補う
    expect(result.current.data).toEqual({ articles, page: 1, totalCount: null, isLastPage: true, source: 'api' });
  });

  it('形式のバージョン 1 の articles.json を読み、知らないバージョンは error', async () => {
    const v1 = jsonFetch({ version: 1, ...syncJson });
    const { result } = renderHook(() => useNoteArticles({ url: '/note/articles.json', fetch: v1 }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.articles).toHaveLength(6);

    for (const [version, body] of [
      [2, { ...syncJson, version: 2 }],
      ['1', { ...syncJson, version: '1' }],
      [null, { ...syncJson, version: null }],
      // 新しい形式で articles の形が変わっていても、version の誤りとして知らせる
      [3, { version: 3, user: 'kida_lw', articles: { items: [] } }],
    ] as const) {
      const fetch = jsonFetch(body);
      const { result: r, unmount } = renderHook(() => useNoteArticles({ url: '/note/articles.json', fetch }));
      await waitFor(() => expect(r.current.isLoading).toBe(false));
      expect(r.current.error?.message, String(version)).toMatch(/version/);
      expect(r.current.articles).toEqual([]);
      unmount();
    }
  });

  it('中継エンドポイントの失敗は error の status と code で分けられる', async () => {
    for (const [status, code] of [
      [404, 'NOTE_NOT_FOUND'],
      [502, 'NOTE_RATE_LIMITED'],
      [400, 'INVALID_REQUEST'],
      [500, 'INTERNAL_ERROR'],
    ] as const) {
      const fetch = jsonFetch({ error: code }, status);
      const { result, unmount } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.status).toBe(status);
      expect(result.current.error?.code).toBe(code);
      expect(result.current.data).toBeNull();
      unmount();
    }
  });

  it('コードとして読めない失敗の本文は code が null（status は入る）', async () => {
    const big = new Response(JSON.stringify({ error: 'NOTE_NOT_FOUND' }), {
      status: 404,
      headers: { 'content-length': String(16 * 1024 + 1) },
    });
    for (const [status, fetch] of [
      [500, vi.fn(async () => new Response('<html>oops</html>', { status: 500 }))],
      [502, jsonFetch({ error: 123 }, 502)],
      [502, jsonFetch({ error: '<script>' }, 502)],
      [502, jsonFetch({ error: `A${'B'.repeat(64)}` }, 502)],
      [502, jsonFetch({ error: 'note_not_found' }, 502)],
      [404, jsonFetch([{ error: 'NOTE_NOT_FOUND' }], 404)],
      [404, vi.fn(async () => big)],
    ] as const) {
      const { result, unmount } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error?.status).toBe(status);
      expect(result.current.error?.code).toBeNull();
      unmount();
    }
    // ちょうど64文字のコードは入る
    const fetch = jsonFetch({ error: `A${'B'.repeat(63)}` }, 502);
    const { result } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.code).toBe(`A${'B'.repeat(63)}`);
  });

  it('通信の失敗・取得できない URL・形の違う 200 の応答は status も code も null', async () => {
    const cases: [string, typeof globalThis.fetch][] = [
      [
        '/api/note',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      ],
      ['https://note.com/x', jsonFetch(page)],
      ['/api/note', jsonFetch({ articles: 'x' })],
    ];
    for (const [url, fetch] of cases) {
      const { result, unmount } = renderHook(() => useNoteArticles({ url, fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error, url).toBeInstanceOf(Error);
      expect(result.current.error?.status).toBeNull();
      expect(result.current.error?.code).toBeNull();
      unmount();
    }
  });

  it('利用者の fetch が投げたエラーは書き換えずに包み直す（DOMException・status を持つエラーでも止まらない）', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const custom = Object.assign(new Error('bad request'), { status: 'x', code: 'ERR_BAD_REQUEST' });
    for (const thrown of [timeout, custom]) {
      const fetch = vi.fn(async () => {
        throw thrown;
      });
      const { result, unmount } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error).not.toBe(thrown);
      expect(result.current.error?.cause).toBe(thrown);
      expect(result.current.error?.message).toBe(thrown.message);
      expect(result.current.error?.status).toBeNull();
      expect(result.current.error?.code).toBeNull();
      unmount();
    }
    expect(custom.status).toBe('x');
  });

  it('HTTP エラー・JSON でない応答・形が違う JSON は error', async () => {
    for (const fetch of [
      jsonFetch({ error: 'NOTE_NOT_FOUND' }, 404),
      vi.fn(async () => new Response('<html>')),
      jsonFetch({ articles: 'x' }),
      jsonFetch([1, 2]),
    ]) {
      const { result, unmount } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.articles).toEqual([]);
      expect(result.current.data).toBeNull();
      unmount();
    }
  });

  it('note.com の URL・http(s) でない URL は取得せずに error（ブラウザから note に直接アクセスさせない）', async () => {
    const fetch = jsonFetch(page);
    for (const url of [
      'https://note.com/api/v2/creators/kida_lw/contents',
      'https://NOTE.COM/kida_lw/rss',
      'https://sub.note.com/x',
      'https://note.com./api/v2/creators/kida_lw/contents',
      'https://NOTE.COM../x',
      'javascript:alert(1)',
      'data:application/json,{}',
    ]) {
      const { result, unmount } = renderHook(() => useNoteArticles({ url, fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error?.message, url).toMatch(/note|http/);
      unmount();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('主な項目の型が違う記事は除く（描画で落ちないように）', async () => {
    const broken = [{ title: {}, hashtags: null }, { ...articles[0], author: null }, 'x', null];
    const fetch = jsonFetch({ ...page, articles: [...broken, articles[1]] });
    const { result } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.articles).toEqual([articles[1]]);
  });

  it('描画ごとに新しい fetch を渡しても、取り直しを繰り返さない', async () => {
    const calls: string[] = [];
    const { result } = renderHook(() =>
      useNoteArticles({
        url: '/api/note',
        fetch: async (input) => {
          calls.push(String(input));
          return new Response(JSON.stringify(page));
        },
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(1);
  });

  it('URL が変わったら取り直し、古い応答は捨てる', async () => {
    let resolveFirst: (response: Response) => void = () => {};
    const fetch = vi.fn((input: string | URL | Request, _init?: RequestInit) =>
      String(input).includes('page=1')
        ? new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify(page))),
    );
    const { result, rerender } = renderHook(({ url }) => useNoteArticles({ url, fetch }), {
      initialProps: { url: '/api/note?page=1' },
    });
    rerender({ url: '/api/note?page=2' });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    // 遅れて届いた1ページ目の応答で上書きしない
    resolveFirst(new Response(JSON.stringify({ ...page, page: 1 })));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.data?.page).toBe(2);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('ページの取得元：中継エンドポイントの source はそのまま、articles.json は先頭の記事、記事がなければ api', async () => {
    const rss = articles.map((article) => ({ ...article, source: 'rss' as const }));
    for (const [body, expected] of [
      [{ ...page, source: 'rss' }, 'rss'],
      [{ ...syncJson, articles: rss }, 'rss'],
      [{ ...syncJson, articles: [] }, 'api'],
    ] as const) {
      const fetch = jsonFetch(body);
      const { result, unmount } = renderHook(() => useNoteArticles({ url: '/api/note', fetch }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.data?.source).toBe(expected);
      unmount();
    }
  });
});
