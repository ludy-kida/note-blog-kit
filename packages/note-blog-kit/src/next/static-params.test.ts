import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { generateNoteStaticParams } from './static-params.js';

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

/** fixtures/contents の3ページを、最終ページを指定して返すモックの fetch（実 API にはアクセスしない） */
function mockFetch({ lastPage }: { lastPage: number }) {
  return vi.fn(async (...[input]: FetchArgs) => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    const file = new URL(`../../../../fixtures/contents/page-${((page - 1) % 3) + 1}.json`, import.meta.url);
    const json = JSON.parse(readFileSync(file, 'utf8')) as {
      data: { isLastPage: boolean; contents: { key: string }[] };
    };
    json.data.isLastPage = page >= lastPage;
    // 3ページを超えたら key を変えて、別の記事として扱う
    if (page > 3) for (const content of json.data.contents) content.key = `${content.key}p${page}`;
    return new Response(JSON.stringify(json));
  });
}

const base = { user: 'kida_lw', minIntervalMs: 0 } as const;

describe('generateNoteStaticParams', () => {
  it('全記事の key を { key } の配列で返す', async () => {
    const fetch = mockFetch({ lastPage: 3 });
    const params = await generateNoteStaticParams({ ...base, fetch });
    expect(params).toHaveLength(18);
    expect(params[0]).toEqual({ key: expect.stringMatching(/^n[0-9a-z]+$/) });
    expect(new Set(params.map((p) => p.key)).size).toBe(18);
  });

  it('maxPages の上限を守る', async () => {
    const fetch = mockFetch({ lastPage: 100 });
    const params = await generateNoteStaticParams({ ...base, fetch, maxPages: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(params).toHaveLength(12);
  });

  it('maxPages の既定は 20 ページ', async () => {
    const fetch = mockFetch({ lastPage: 100 });
    const params = await generateNoteStaticParams({ ...base, fetch });
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(params).toHaveLength(120);
  });

  it('param で動的セグメントの名前を変えられる', async () => {
    const fetch = mockFetch({ lastPage: 1 });
    const params = await generateNoteStaticParams({ ...base, fetch, param: 'slug' });
    expect(params).toHaveLength(6);
    expect(Object.keys(params[0] ?? {})).toEqual(['slug']);
  });

  it('不正な param・user は TypeError', async () => {
    const fetch = mockFetch({ lastPage: 1 });
    await expect(generateNoteStaticParams({ ...base, fetch, param: '' })).rejects.toBeInstanceOf(TypeError);
    await expect(generateNoteStaticParams({ ...base, fetch, user: '../x' })).rejects.toBeInstanceOf(TypeError);
  });
});
