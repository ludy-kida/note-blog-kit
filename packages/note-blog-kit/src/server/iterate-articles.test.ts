import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { NoteArticleSummary } from '../core/types.js';
import { NoteHttpError } from './errors.js';
import { iterateArticles, listAllArticles } from './iterate-articles.js';

type RawPage = { data: { contents: Record<string, unknown>[]; isLastPage: boolean; totalCount: number } };

const loadPage = (page: number): RawPage =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/contents/page-${page}.json`, import.meta.url), 'utf8'));

const pageOf = (url: string): number => Number(new URL(url).searchParams.get('page'));

/**
 * ページ番号に応じて fixture を返すモックの fetch。
 * edit でページごとに書き換えられる。4ページ目以降は3ページ目の内容を key を変えて使う。
 */
function mockFetch(edit: (json: RawPage, page: number) => RawPage | Response = (json) => json) {
  return vi.fn(async (input: string | URL | Request) => {
    const page = pageOf(String(input));
    const json = structuredClone(loadPage(Math.min(page, 3)));
    if (page > 3) {
      json.data.contents = json.data.contents.map((item) => ({ ...item, key: `${String(item.key)}p${page}` }));
    }
    const result = edit(json, page);
    return result instanceof Response ? result : new Response(JSON.stringify(result));
  });
}

/** 3ページ目を最終ページにする */
const lastAt3 = (json: RawPage, page: number): RawPage => {
  json.data.isLastPage = page >= 3;
  return json;
};

const base = { user: 'kida_lw', minIntervalMs: 0 } as const;

async function collect(generator: AsyncGenerator<NoteArticleSummary, unknown>) {
  const items: NoteArticleSummary[] = [];
  let result = await generator.next();
  while (!result.done) {
    items.push(result.value);
    result = await generator.next();
  }
  return { items, returned: result.value };
}

describe('iterateArticles', () => {
  it('最終ページまで順に記事を返す', async () => {
    const fetch = mockFetch(lastAt3);
    const { items, returned } = await collect(iterateArticles({ ...base, fetch }));
    expect(items).toHaveLength(18);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map(([url]) => pageOf(String(url)))).toEqual([1, 2, 3]);
    expect(returned).toEqual({ truncated: false, totalCount: 237, pages: 3 });
  });

  it('途中のページで失敗したら、それまでの記事を返した後にエラーを投げる', async () => {
    const fetch = mockFetch((json, page) => (page === 2 ? new Response('oops', { status: 503 }) : json));
    const items: NoteArticleSummary[] = [];
    const error = await (async () => {
      for await (const item of iterateArticles({ ...base, fetch })) items.push(item);
    })().catch((e: unknown) => e);
    expect(items).toHaveLength(6);
    expect(error).toBeInstanceOf(NoteHttpError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('ページ間で同じ key が出たら1回だけ返す', async () => {
    const fetch = mockFetch((json, page) => {
      // 新しい記事の公開でページがずれた状況：2ページ目の先頭に1ページ目の最後の記事が再び出る
      if (page === 2)
        json.data.contents.unshift(structuredClone(loadPage(1).data.contents[5] as Record<string, unknown>));
      return lastAt3(json, page);
    });
    const { items } = await collect(iterateArticles({ ...base, fetch }));
    expect(items).toHaveLength(18);
    expect(new Set(items.map((item) => item.key)).size).toBe(18);
  });

  it('記事が0件のページが来たら、isLastPage が false でもそこで終わる', async () => {
    const fetch = mockFetch((json, page) => {
      if (page === 2) json.data.contents = [];
      json.data.isLastPage = false;
      return json;
    });
    const { items, returned } = await collect(iterateArticles({ ...base, fetch }));
    expect(items).toHaveLength(6);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(returned).toMatchObject({ truncated: false, pages: 2 });
  });

  it('maxPages が不正なら TypeError で、fetch を呼ばない', async () => {
    const fetch = mockFetch();
    for (const maxPages of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(collect(iterateArticles({ ...base, fetch, maxPages }))).rejects.toBeInstanceOf(TypeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signal で中断したら、その理由をそのまま投げる', async () => {
    const fetch = mockFetch();
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(collect(iterateArticles({ ...base, fetch, signal: controller.signal }))).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('listAllArticles', () => {
  it('全件を配列で返す', async () => {
    const result = await listAllArticles({ ...base, fetch: mockFetch(lastAt3) });
    expect(result.articles).toHaveLength(18);
    expect(result.articles[0]?.key).toBe(loadPage(1).data.contents[0]?.key);
    expect(result).toMatchObject({ truncated: false, totalCount: 237, pages: 3 });
  });

  it('maxPages で打ち切ったら truncated: true', async () => {
    const fetch = mockFetch(lastAt3);
    const result = await listAllArticles({ ...base, fetch, maxPages: 2 });
    expect(result.articles).toHaveLength(12);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ truncated: true, pages: 2 });
  });

  it('maxPages ちょうどで最終ページなら truncated: false', async () => {
    const result = await listAllArticles({ ...base, fetch: mockFetch(lastAt3), maxPages: 3 });
    expect(result).toMatchObject({ truncated: false, pages: 3 });
  });

  it('maxPages の既定値は 20', async () => {
    const fetch = mockFetch((json) => {
      json.data.isLastPage = false;
      return json;
    });
    const result = await listAllArticles({ ...base, fetch });
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(result.articles).toHaveLength(120);
    expect(result).toMatchObject({ truncated: true, pages: 20 });
  });
});
