import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { NoteArticlePage, NoteArticlesHandlerErrorBody } from '../core/types.js';
import { createNoteArticlesHandler } from './articles-handler.js';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../../fixtures/${path}`, import.meta.url), 'utf8');

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

/** fixture を返すモックの fetch（実 API にはアクセスしない） */
function mockFetch(respond?: (url: URL) => Response | undefined) {
  return vi.fn(async (...[input]: FetchArgs) => {
    const url = new URL(String(input));
    const custom = respond?.(url);
    if (custom) return custom;
    if (url.pathname.endsWith('/rss')) return new Response(fixture('rss/feed.xml'));
    const page = Math.min(Number(url.searchParams.get('page')), 3);
    return new Response(fixture(`contents/page-${page}.json`));
  });
}

const base = { user: 'kida_lw', minIntervalMs: 0 } as const;
const request = (query = '') => new Request(`https://example.com/api/note${query}`);

describe('createNoteArticlesHandler', () => {
  it('記事一覧の1ページを JSON で返し、キャッシュヘッダーを付ける', async () => {
    const fetch = mockFetch();
    const GET = createNoteArticlesHandler({ ...base, fetch });
    const response = await GET(request('?page=2'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=3600');
    const body = (await response.json()) as NoteArticlePage;
    expect(body.page).toBe(2);
    expect(body.articles).toHaveLength(6);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/v2/creators/kida_lw/contents?kind=note&page=2');
  });

  it('page の既定は 1。cacheSeconds でキャッシュの秒数を変えられる', async () => {
    const GET = createNoteArticlesHandler({ ...base, fetch: mockFetch(), cacheSeconds: 60 });
    const response = await GET(request());
    expect(((await response.json()) as NoteArticlePage).page).toBe(1);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=60');
  });

  it('不正な page は 400 で、note に問い合わせない', async () => {
    const fetch = mockFetch();
    const GET = createNoteArticlesHandler({ ...base, fetch, maxPage: 5 });
    for (const query of [
      '?page=0',
      '?page=6',
      '?page=abc',
      '?page=1.5',
      '?page=-1',
      '?page=',
      // 同じページを表す別の書き方（CDN のキャッシュを外させない）
      '?page=01',
      '?page=1.0',
      '?page=1e0',
      '?page=0x1',
      '?page=+1',
      '?page=%201',
      // page 以外のクエリ・重複
      '?page=1&_=123',
      '?x=1',
      '?page=1&page=2',
    ]) {
      const response = await GET(request(query));
      expect(response.status, query).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await GET(request('?page=5'))).status).toBe(200);
  });

  it('note の 404 は 404、それ以外の失敗は 502。キャッシュさせず、本文に詳細を出さない', async () => {
    const cases: [Response, number, string][] = [
      [new Response('{"data":"not found"}', { status: 404 }), 404, 'NOTE_NOT_FOUND'],
      [new Response('secret detail', { status: 503 }), 502, 'NOTE_HTTP_ERROR'],
      [new Response('{"data":{"contents":"x"}}'), 502, 'NOTE_SCHEMA_ERROR'],
    ];
    for (const [noteResponse, status, code] of cases) {
      const GET = createNoteArticlesHandler({ ...base, fetch: mockFetch(() => noteResponse) });
      const response = await GET(request());
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const text = await response.text();
      const body: NoteArticlesHandlerErrorBody = JSON.parse(text);
      expect(body).toEqual({ error: code });
      expect(text).not.toContain('secret');
      expect(text).not.toContain('note.com');
    }
  });

  it("source: 'rss' は1ページだけ受け付ける（?page=2 は 400 で、500 にしない）", async () => {
    const GET = createNoteArticlesHandler({ ...base, fetch: mockFetch(), source: 'rss' });
    expect((await GET(request('?page=2'))).status).toBe(400);
    expect((await GET(request())).status).toBe(200);
  });

  it('リクエストが中断されたら note への取得も中断する', async () => {
    const fetch = vi.fn(
      (...[, init]: FetchArgs) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const GET = createNoteArticlesHandler({ ...base, fetch });
    const controller = new AbortController();
    const promise = GET(new Request('https://example.com/api/note', { signal: controller.signal }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort(new Error('client went away'));
    await expect(promise).rejects.toThrow('client went away');
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('source などのオプションは listArticles に渡す', async () => {
    const fetch = mockFetch();
    const GET = createNoteArticlesHandler({ ...base, fetch, source: 'rss' });
    const body = (await (await GET(request())).json()) as NoteArticlePage;
    expect(body.articles).toHaveLength(25);
    expect(body.articles[0]?.source).toBe('rss');
  });

  it('不正なオプションは作るときに TypeError', () => {
    expect(() => createNoteArticlesHandler({ user: '../x' })).toThrow(TypeError);
    expect(() => createNoteArticlesHandler({ ...base, maxPage: 0 })).toThrow(TypeError);
    expect(() => createNoteArticlesHandler({ ...base, cacheSeconds: -1 })).toThrow(TypeError);
    expect(() => createNoteArticlesHandler({ ...base, source: 'rss', maxPage: 2 })).toThrow(TypeError);
    expect(() => createNoteArticlesHandler({ ...base, source: 'xml' as unknown as 'rss' })).toThrow(TypeError);
    expect(() => createNoteArticlesHandler({ ...base, timeoutMs: 0 })).toThrow(TypeError);
  });
});
