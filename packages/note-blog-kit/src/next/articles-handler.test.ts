import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { NoteArticlePage } from '../core/types.js';
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
    for (const query of ['?page=0', '?page=6', '?page=abc', '?page=1.5', '?page=-1', '?page=']) {
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
      expect(JSON.parse(text)).toEqual({ error: code });
      expect(text).not.toContain('secret');
      expect(text).not.toContain('note.com');
    }
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
  });
});
