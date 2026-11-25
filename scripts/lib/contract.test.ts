import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { getArticle, listArticles } from '../../packages/note-blog-kit/src/server/index.ts';
import { type ContractDeps, exitCodeOf, formatReport, runContractCheck } from './contract.ts';

const fixture = (path: string): string => readFileSync(new URL(`../../fixtures/${path}`, import.meta.url), 'utf8');

type Respond = (url: URL) => Response | undefined;

/** fixture を返すモックの fetch（note.com にはアクセスしない）。送ったリクエストを記録する */
function setup(respond?: Respond) {
  const requests: { url: URL; init: RequestInit | undefined }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    requests.push({ url, init });
    const custom = respond?.(url);
    if (custom) return custom;
    if (url.pathname.endsWith('/rss')) return new Response(fixture('rss/feed.xml'));
    const note = url.pathname.match(/\/api\/v3\/notes\/(n[0-9a-z]+)$/);
    if (note) {
      return new Response(fixture('notes/n55256baa5425.json'));
    }
    return new Response(fixture('contents/page-1.json'));
  };
  const options = { fetch, minIntervalMs: 0 };
  const deps: ContractDeps = {
    user: 'kida_lw',
    listArticles: (o) => listArticles({ ...options, ...o }),
    getArticle: (o) => getArticle({ ...options, ...o }),
  };
  return { deps, requests };
}

const firstFreeKey = (): string => {
  const json = JSON.parse(fixture('contents/page-1.json')) as {
    data: { contents: { key: string; price: number }[] };
  };
  const free = json.data.contents.find((content) => content.price === 0);
  assert.ok(free);
  return free.key;
};

describe('runContractCheck', () => {
  it('一覧・本文・RSS の3リクエストで確かめ、すべて通れば ok', async () => {
    const { deps, requests } = setup();
    const result = await runContractCheck(deps);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.checks.map((check) => check.status),
      ['ok', 'ok', 'ok'],
    );
    assert.equal(requests.length, 3);
    assert.match(requests[0]?.url.pathname ?? '', /\/api\/v2\/creators\/kida_lw\/contents$/);
    assert.equal(requests[0]?.url.searchParams.get('page'), '1');
    // 本文は一覧の先頭の無料記事
    assert.ok(requests[1]?.url.pathname.endsWith(`/api/v3/notes/${firstFreeKey()}`));
    assert.ok(requests[2]?.url.pathname.endsWith('/kida_lw/rss'));
    // Cookie・認証情報を送らない
    for (const { init } of requests) assert.equal(init?.credentials, 'omit');
    assert.equal(exitCodeOf(result), 0);
  });

  it('一覧の形が変わったら schema で、消えた・型が変わったキーの path を出す。本文は飛ばし、RSS は確かめる', async () => {
    const json = JSON.parse(fixture('contents/page-1.json')) as {
      data: { contents: Record<string, unknown>[] };
    };
    const first = json.data.contents[0];
    assert.ok(first);
    delete first.name;
    first.price = '0';
    const { deps, requests } = setup((url) =>
      url.pathname.endsWith('/contents') ? new Response(JSON.stringify(json)) : undefined,
    );
    const result = await runContractCheck(deps);
    assert.equal(result.ok, false);
    const [list, body, rss] = result.checks;
    assert.equal(list?.status, 'failed');
    assert.equal(list?.kind, 'schema');
    assert.equal(list?.code, 'NOTE_SCHEMA_ERROR');
    const paths = list?.issues?.map((issue) => issue.path) ?? [];
    assert.ok(paths.includes('data.contents.0.name'), paths.join(', '));
    assert.ok(paths.includes('data.contents.0.price'), paths.join(', '));
    assert.equal(body?.status, 'skipped');
    assert.equal(rss?.status, 'ok');
    assert.equal(requests.length, 2);
    assert.equal(exitCodeOf(result), 1);
  });

  it('本文が 404 なら not-found（形の変化として扱う）', async () => {
    const { deps } = setup((url) =>
      url.pathname.includes('/api/v3/notes/') ? new Response('{}', { status: 404 }) : undefined,
    );
    const result = await runContractCheck(deps);
    assert.equal(result.checks[1]?.kind, 'not-found');
    assert.equal(exitCodeOf(result), 1);
  });

  it('405 など 404 以外の 4xx は http（形の変化として扱う）', async () => {
    const { deps } = setup((url) =>
      url.pathname.endsWith('/contents') ? new Response('', { status: 405 }) : undefined,
    );
    const result = await runContractCheck(deps);
    assert.equal(result.checks[0]?.kind, 'http');
    assert.equal(result.checks[0]?.httpStatus, 405);
    assert.equal(exitCodeOf(result), 1);
  });

  it('5xx・429・通信の失敗は transient。一時的な失敗だけなら終了コード 2', async () => {
    for (const respond of [
      (url: URL) => (url.pathname.endsWith('/rss') ? new Response('', { status: 503 }) : undefined),
      (url: URL) => (url.pathname.endsWith('/rss') ? new Response('', { status: 429 }) : undefined),
    ]) {
      const { deps } = setup(respond);
      const result = await runContractCheck(deps);
      assert.equal(result.checks[2]?.kind, 'transient');
      assert.equal(exitCodeOf(result), 2);
    }
    const { deps } = setup();
    const result = await runContractCheck({
      ...deps,
      listArticles: async () => {
        throw Object.assign(new Error('socket hang up'), { name: 'NoteNetworkError', code: 'NOTE_NETWORK_ERROR' });
      },
    });
    assert.equal(result.checks[0]?.kind, 'transient');
    assert.equal(result.checks[2]?.kind, 'transient');
    assert.equal(exitCodeOf(result), 2);
  });

  it('一時的な失敗と形の変化が混ざれば終了コード 1', async () => {
    const { deps } = setup((url) => {
      if (url.pathname.endsWith('/rss')) return new Response('', { status: 502 });
      if (url.pathname.includes('/api/v3/notes/')) return new Response('{"data":{}}');
      return undefined;
    });
    const result = await runContractCheck(deps);
    assert.equal(result.checks[1]?.kind, 'schema');
    assert.equal(result.checks[2]?.kind, 'transient');
    assert.equal(exitCodeOf(result), 1);
  });

  it('一覧に無料記事がなければ本文は飛ばす（失敗にしない）', async () => {
    const json = JSON.parse(fixture('contents/page-1.json')) as { data: { contents: { price: number }[] } };
    for (const content of json.data.contents) content.price = 500;
    const { deps, requests } = setup((url) =>
      url.pathname.endsWith('/contents') ? new Response(JSON.stringify(json)) : undefined,
    );
    const result = await runContractCheck(deps);
    assert.equal(result.checks[1]?.status, 'skipped');
    assert.equal(result.ok, true);
    assert.equal(requests.length, 2);
  });

  it('本文は自分の無料記事から選ぶ（一覧に他人の記事があっても not-found にしない）', async () => {
    const json = JSON.parse(fixture('contents/page-1.json')) as {
      data: { contents: { key: string; price: number; user: { urlname: string } }[] };
    };
    const mine = json.data.contents.find((content) => content.price === 0);
    assert.ok(mine);
    // 先頭に他人の無料記事を置く
    json.data.contents.unshift({ ...mine, key: 'n000000000001', user: { ...mine.user, urlname: 'someone_else' } });
    const { deps, requests } = setup((url) =>
      url.pathname.endsWith('/contents') ? new Response(JSON.stringify(json)) : undefined,
    );
    const result = await runContractCheck(deps);
    assert.equal(result.ok, true, JSON.stringify(result.checks));
    assert.ok(requests[1]?.url.pathname.endsWith(`/api/v3/notes/${mine.key}`));
  });

  it('ライブラリ以外の例外は unexpected（形の変化として扱う）', async () => {
    const { deps } = setup();
    const result = await runContractCheck({
      ...deps,
      getArticle: async () => {
        throw new TypeError('boom');
      },
    });
    assert.equal(result.checks[1]?.kind, 'unexpected');
    assert.equal(exitCodeOf(result), 1);
  });
});

describe('formatReport', () => {
  it('結果の表と path を出し、応答の中身（URL・本文・メッセージ）は入れない', async () => {
    const json = JSON.parse(fixture('contents/page-1.json')) as { data: { contents: Record<string, unknown>[] } };
    const first = json.data.contents[0];
    assert.ok(first);
    first.name = 12345;
    const { deps } = setup((url) => {
      if (url.pathname.endsWith('/contents')) return new Response(JSON.stringify(json));
      if (url.pathname.endsWith('/rss')) return new Response('secret detail', { status: 503 });
      return undefined;
    });
    const report = formatReport(await runContractCheck(deps), new Date('2026-11-24T03:17:00Z'));
    assert.match(report, /2026-11-24/);
    assert.match(report, /NOTE_SCHEMA_ERROR/);
    assert.match(report, /data\.contents\.0\.name/);
    assert.match(report, /503/);
    assert.doesNotMatch(report, /note\.com/);
    assert.doesNotMatch(report, /secret/);
    assert.doesNotMatch(report, /12345/);
  });

  it('path に入ったマークダウン・メンションは、コードブロックの外に出さない', () => {
    const report = formatReport(
      {
        ok: false,
        checks: [
          {
            name: '一覧 API（1ページ目）',
            status: 'failed',
            kind: 'schema',
            code: 'NOTE_SCHEMA_ERROR',
            issues: [{ path: 'data.```\n@someone [x](javascript:alert(1))', message: 'Required' }],
          },
        ],
      },
      new Date('2026-11-24T03:17:00Z'),
    );
    const fences = report.match(/^```/gm) ?? [];
    assert.equal(fences.length % 2, 0);
    const outside = report.split(/^```[a-z]*$/m).filter((_, index) => index % 2 === 0);
    for (const part of outside) assert.doesNotMatch(part, /@someone/);
  });

  it('多すぎる issues は先頭だけ出す', () => {
    const issues = Array.from({ length: 80 }, (_, i) => ({ path: `data.contents.${i}.name`, message: 'Required' }));
    const report = formatReport(
      { ok: false, checks: [{ name: 'x', status: 'failed', kind: 'schema', code: 'NOTE_SCHEMA_ERROR', issues }] },
      new Date('2026-11-24T03:17:00Z'),
    );
    assert.match(report, /data\.contents\.49\.name/);
    assert.doesNotMatch(report, /data\.contents\.50\.name/);
    assert.match(report, /ほか 30 件/);
  });
});
