import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteNotFoundError, NoteSchemaError } from './errors.js';
import { getArticle } from './get-article.js';
import { listArticles } from './list-articles.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../fixtures/${name}.json`, import.meta.url), 'utf8');

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

/** fixture を返すモックの fetch。実 API にはアクセスしない */
function mockFetch(respond: (url: string) => Response = () => new Response(fixture('notes/n55256baa5425'))) {
  return vi.fn(async (...[input]: FetchArgs) => respond(String(input)));
}

const base = { key: 'n55256baa5425', user: 'kida_lw', minIntervalMs: 0 } as const;

describe('getArticle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('v3 notes を取得して NoteArticle を返す', async () => {
    const fetch = mockFetch();
    const article = await getArticle({ ...base, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://note.com/api/v3/notes/n55256baa5425');
    expect(article.key).toBe('n55256baa5425');
    expect(article.isPartial).toBe(false);
    expect(article.bodyHtml).not.toContain('<script');
  });

  it('有料記事は isPartial: true', async () => {
    const fetch = mockFetch(() => new Response(fixture('notes/n52a7f4fa0a2e')));
    const article = await getArticle({ ...base, key: 'n52a7f4fa0a2e', fetch });
    expect(article.isPartial).toBe(true);
  });

  it('Cookie・認証情報を送らない', async () => {
    const fetch = mockFetch();
    await getArticle({ ...base, fetch });
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    const headers = new Headers(init?.headers);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
  });

  it('user は1人でも複数でも指定できる', async () => {
    for (const user of ['kida_lw', ['someone', 'kida_lw']] as const) {
      const article = await getArticle({ ...base, user, fetch: mockFetch() });
      expect(article.author.urlname).toBe('kida_lw');
    }
  });

  it('指定にない著者の記事は NoteNotFoundError（他人の記事を返さない）', async () => {
    for (const user of ['someone_else', ['a', 'b'], 'KIDA_LW'] as const) {
      const error = await getArticle({ ...base, user, fetch: mockFetch() }).catch((e: unknown) => e);
      expect(error, String(user)).toBeInstanceOf(NoteNotFoundError);
      expect((error as NoteNotFoundError).code).toBe('NOTE_NOT_FOUND');
      expect((error as NoteNotFoundError).url).toBe('https://note.com/api/v3/notes/n55256baa5425');
      // 記事が存在しない場合と同じ文面で、実際の著者名を出さない
      expect((error as NoteNotFoundError).message).toBe(
        'Not found on note: https://note.com/api/v3/notes/n55256baa5425',
      );
      expect((error as NoteNotFoundError).message).not.toContain('kida_lw');
    }
  });

  it('不正な user は TypeError で、fetch を呼ばない', async () => {
    const fetch = mockFetch();
    // biome-ignore lint/suspicious/noSparseArray: 穴のある配列も拒否することを確かめる
    const sparse = [, 'kida_lw'];
    for (const user of [[], '', '../x', 'a b', 42, null, ['kida_lw', 'a b'], ['kida_lw', 1], undefined, sparse]) {
      await expect(
        getArticle({ ...base, user: user as unknown as string, fetch }),
        JSON.stringify(user),
      ).rejects.toBeInstanceOf(TypeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  /** fixture の本文を差し替えた応答（著者も変えられる） */
  const withBody = (body: string, urlname = 'kida_lw') => {
    const json = JSON.parse(fixture('notes/n55256baa5425')) as {
      data: { body: string; user: { urlname: string } };
    };
    json.data.body = body;
    json.data.user.urlname = urlname;
    return () => new Response(JSON.stringify(json));
  };

  it('入れ子が深すぎる本文は、サニタイズせずに NoteSchemaError で、1 秒以内に終わる', async () => {
    const start = performance.now();
    const error = await getArticle({ ...base, fetch: mockFetch(withBody('<div>'.repeat(200_000))) }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(NoteSchemaError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('他人の記事は、本文の検証・サニタイズより前に NoteNotFoundError になる', async () => {
    const start = performance.now();
    const error = await getArticle({
      ...base,
      fetch: mockFetch(withBody('<div>'.repeat(200_000), 'someone_else')),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoteNotFoundError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('404 は NoteNotFoundError', async () => {
    const fetch = mockFetch(() => new Response('{"data":"not found"}', { status: 404 }));
    await expect(getArticle({ ...base, fetch })).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it('形が想定と違うレスポンスは NoteSchemaError', async () => {
    const fetch = mockFetch(() => new Response('{"data":{"key":"x"}}'));
    await expect(getArticle({ ...base, fetch })).rejects.toBeInstanceOf(NoteSchemaError);
  });

  it('要求と違うキーの記事が返ってきたら NoteSchemaError', async () => {
    const fetch = mockFetch(() => new Response(fixture('notes/n52a7f4fa0a2e')));
    await expect(getArticle({ ...base, fetch })).rejects.toBeInstanceOf(NoteSchemaError);
  });

  it('不正な key・オプションは TypeError で、fetch を呼ばない', async () => {
    const fetch = mockFetch();
    const tricky = { toString: () => 'n55256baa5425' } as unknown as string;
    for (const options of [
      { key: '' },
      { key: '../x' },
      { key: 'n55256baa5425/../../api' },
      { key: 'N55256BAA5425' },
      { key: 'x55256baa5425' },
      { key: `n${'a'.repeat(33)}` },
      { key: tricky },
      { key: 'n55256baa5425', timeoutMs: 0 },
      { key: 'n55256baa5425', minIntervalMs: -1 },
    ]) {
      await expect(getArticle({ minIntervalMs: 0, user: 'kida_lw', ...options, fetch })).rejects.toBeInstanceOf(
        TypeError,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('listArticles と同じ送信列で、既定で 1 秒空ける', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('note-blog-kit.throttle')];
    const sentAt: number[] = [];
    const fetch = mockFetch((url) => {
      sentAt.push(Date.now());
      return new Response(url.includes('/v3/') ? fixture('notes/n55256baa5425') : fixture('contents/page-1'));
    });
    const first = listArticles({ user: 'kida_lw', fetch });
    const second = getArticle({ key: 'n55256baa5425', user: 'kida_lw', fetch });
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all([first, second]);
    expect(sentAt).toEqual([10_000, 11_000]);
  });
});
