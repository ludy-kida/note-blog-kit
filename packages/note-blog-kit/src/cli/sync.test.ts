import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteArticle, NoteArticleSummary } from '../core/types.js';
import { run } from './run.js';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../../fixtures/${path}`, import.meta.url), 'utf8');

const NOTE_TEMPLATE = JSON.parse(fixture('notes/n55256baa5425.json')) as { data: Record<string, unknown> };

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

/**
 * fixture を返すモックの fetch（実 API にはアクセスしない）。
 * 一覧は contents/page-N.json（3ページ目が最終ページ）。本文は無料記事の fixture の key を差し替えて返す
 */
function mockFetch(override?: (url: URL) => Response | undefined) {
  return vi.fn(async (...[input]: FetchArgs) => {
    const url = new URL(String(input));
    const custom = override?.(url);
    if (custom) return custom;
    const noteKey = /^\/api\/v3\/notes\/(n[0-9a-z]+)$/.exec(url.pathname)?.[1];
    if (noteKey !== undefined) {
      return new Response(JSON.stringify({ data: { ...NOTE_TEMPLATE.data, key: noteKey } }));
    }
    // fixture は3ページ（18件）しかないので、3ページ目を最終ページとする
    const page = Number(url.searchParams.get('page'));
    const json = JSON.parse(fixture(`contents/page-${Math.min(page, 3)}.json`)) as {
      data: { isLastPage: boolean; contents: unknown[] };
    };
    json.data.isLastPage = page >= 3;
    if (page > 3) json.data.contents = [];
    return new Response(JSON.stringify(json));
  });
}

interface Output {
  out: string[];
  err: string[];
}

/** minIntervalMs は既定 0（待たない）。'default' ならライブラリの既定（1秒）のまま */
function makeDeps(fetch: ReturnType<typeof mockFetch>, minIntervalMs: number | 'default' = 0) {
  const output: Output = { out: [], err: [] };
  return {
    output,
    deps: {
      fetch,
      ...(minIntervalMs === 'default' ? {} : { minIntervalMs }),
      stdout: (line: string) => output.out.push(line),
      stderr: (line: string) => output.err.push(line),
    },
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nbk-sync-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(dir, path), 'utf8')) as T;

describe('note-blog-kit sync', () => {
  it('一覧と本文を JSON に書き出す', async () => {
    const fetch = mockFetch();
    const { deps } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir], deps)).toBe(0);

    const index = await readJson<{
      user: string;
      syncedAt: string;
      truncated: boolean;
      articles: NoteArticleSummary[];
    }>('articles.json');
    expect(index.user).toBe('kida_lw');
    expect(Number.isNaN(Date.parse(index.syncedAt))).toBe(false);
    expect(index.truncated).toBe(false);
    expect(index.articles).toHaveLength(18);
    expect(index.articles[0]).toMatchObject({ source: 'api', author: { urlname: 'kida_lw' } });

    const files = await readdir(join(dir, 'articles'));
    expect(files).toHaveLength(18);
    expect(files.every((name) => /^n[0-9a-z]+\.json$/.test(name))).toBe(true);
    const article = await readJson<NoteArticle>(`articles/${index.articles[0]?.key}.json`);
    expect(article.key).toBe(index.articles[0]?.key);
    expect(article.bodyHtml).toContain('nbk-');
    expect(article.bodyHtml).not.toContain('<script');
    // 一時ファイルを残さない
    expect((await readdir(dir)).sort()).toEqual(['articles', 'articles.json']);
  });

  it('--max-pages で一覧の取得を打ち切る', async () => {
    const fetch = mockFetch(() => undefined);
    const { deps } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir, '--max-pages', '2', '--no-body'], deps)).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    const index = await readJson<{ truncated: boolean; articles: unknown[] }>('articles.json');
    expect(index.truncated).toBe(true);
    expect(index.articles).toHaveLength(12);
  });

  it('--no-body では本文を取得しない', async () => {
    const fetch = mockFetch();
    const { deps } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir, '--no-body'], deps)).toBe(0);
    expect(fetch.mock.calls.some(([input]) => String(input).includes('/api/v3/notes/'))).toBe(false);
    expect(await readdir(dir)).toEqual(['articles.json']);
  });

  it('連続するリクエストは既定で 1 秒以上空ける', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(50_000);
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('note-blog-kit.throttle')];
    const sentAt: number[] = [];
    const fetch = mockFetch(() => {
      sentAt.push(Date.now());
      return undefined;
    });
    const { deps } = makeDeps(fetch, 'default');
    let code: number | undefined;
    const promise = run(['sync', '--user', 'kida_lw', '--out', dir, '--max-pages', '3', '--no-body'], deps).then(
      (value) => {
        code = value;
      },
    );
    for (let i = 0; i < 100 && code === undefined; i += 1) await vi.advanceTimersByTimeAsync(200);
    await promise;
    expect(code).toBe(0);
    expect(sentAt).toHaveLength(3);
    for (let i = 1; i < sentAt.length; i += 1) {
      expect((sentAt[i] as number) - (sentAt[i - 1] as number)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('本文の取得に失敗した記事があれば終了コード 1。ほかの記事と一覧は書き出す', async () => {
    let failed = '';
    const fetch = mockFetch((url) => {
      if (failed === '' && url.pathname.startsWith('/api/v3/notes/')) {
        failed = url.pathname.split('/').pop() as string;
        return new Response('oops', { status: 503 });
      }
      return undefined;
    });
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir], deps)).toBe(1);
    expect((await readdir(join(dir, 'articles'))).length).toBe(17);
    expect((await readJson<{ articles: unknown[] }>('articles.json')).articles).toHaveLength(18);
    expect(output.err.join('\n')).toContain(failed);
  });

  it('著者が --user と違う記事は書き出さない', async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname === '/api/v3/notes/n55256baa5425') {
        const data = {
          ...NOTE_TEMPLATE.data,
          user: { ...(NOTE_TEMPLATE.data.user as object), urlname: 'someone_else' },
        };
        return new Response(JSON.stringify({ data }));
      }
      return undefined;
    });
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir], deps)).toBe(1);
    expect(await readdir(join(dir, 'articles'))).not.toContain('n55256baa5425.json');
    expect(output.err.join('\n')).toContain('n55256baa5425');
  });

  it('前回書き出した記事のうち、今回の一覧にない・書き出せなかった記事のファイルは消す', async () => {
    await mkdir(join(dir, 'articles'), { recursive: true });
    await writeFile(join(dir, 'articles', 'n000000000000.json'), '{"old":true}');
    await writeFile(join(dir, 'articles', 'n55256baa5425.json'), '{"old":true}');
    await writeFile(join(dir, 'articles', 'README.md'), '利用者のファイル');
    const fetch = mockFetch((url) =>
      url.pathname === '/api/v3/notes/n55256baa5425' ? new Response('oops', { status: 503 }) : undefined,
    );
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir], deps)).toBe(1);
    const files = await readdir(join(dir, 'articles'));
    expect(files).not.toContain('n000000000000.json');
    expect(files).not.toContain('n55256baa5425.json');
    expect(files).toContain('README.md');
    expect(files.filter((name) => name.endsWith('.json'))).toHaveLength(17);
    expect(output.out.join('\n')).toContain('n000000000000.json');
  });

  it('著者が --user と違う記事は一覧からも除く', async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname.startsWith('/api/v2/') && url.searchParams.get('page') === '1') {
        const json = JSON.parse(fixture('contents/page-1.json')) as {
          data: { isLastPage: boolean; contents: { user: { urlname: string } }[] };
        };
        (json.data.contents[0] as { user: { urlname: string } }).user.urlname = 'someone_else';
        json.data.isLastPage = true;
        return new Response(JSON.stringify(json));
      }
      return undefined;
    });
    const { deps } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir, '--no-body'], deps)).toBe(1);
    const index = await readJson<{ articles: NoteArticleSummary[] }>('articles.json');
    expect(index.articles).toHaveLength(5);
    expect(index.articles.every((a) => a.author.urlname === 'kida_lw')).toBe(true);
  });

  it('出力先に書けなければ終了コード 1（例外で落ちない）', async () => {
    const file = join(dir, 'not-a-dir');
    await writeFile(file, '');
    const fetch = mockFetch();
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', file, '--max-pages', '1', '--no-body'], deps)).toBe(1);
    expect(output.err.join('\n')).toContain('書き出せませんでした');
  });

  it('一覧の取得に失敗したら終了コード 1 で、何も書き出さない', async () => {
    const fetch = mockFetch(() => new Response('{"data":"not found"}', { status: 404 }));
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--user', 'kida_lw', '--out', dir], deps)).toBe(1);
    expect(await readdir(dir)).toEqual([]);
    expect(output.err.join('\n')).toContain('NOTE_NOT_FOUND');
  });

  it('引数の誤りは終了コード 2 で、fetch しない', async () => {
    const fetch = mockFetch();
    for (const args of [
      ['sync', '--out', dir],
      ['sync', '--user', 'kida_lw'],
      ['sync', '--user', '../x', '--out', dir],
      ['sync', '--user', 'kida_lw', '--out', dir, '--max-pages', '0'],
      ['sync', '--user', 'kida_lw', '--out', dir, '--max-pages', 'abc'],
      ['sync', '--user', 'kida_lw', '--out', dir, '--unknown'],
      ['sync', '--user', 'kida_lw', '--out', dir, 'extra'],
    ]) {
      const { deps, output } = makeDeps(fetch);
      expect(await run(args, deps), args.join(' ')).toBe(2);
      expect(output.err.join('\n')).toContain('使い方');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sync --help は使い方を表示して 0', async () => {
    const fetch = mockFetch();
    const { deps, output } = makeDeps(fetch);
    expect(await run(['sync', '--help'], deps)).toBe(0);
    expect(output.out.join('\n')).toContain('--max-pages');
    expect(fetch).not.toHaveBeenCalled();
  });
});
