import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  assertNoteUrl,
  ConfigError,
  contentsRequest,
  DEFAULT_MAX_PAGES,
  isSensitiveKey,
  keyTokens,
  MAX_PAGES_LIMIT,
  noteRequest,
  parseConfig,
  pickNoteKeys,
  REDACTED_EMAIL,
  rssRequest,
  shouldFetchNextPage,
  stripSensitive,
  waitBeforeNext,
} from './fixture-utils.ts';

describe('parseConfig', () => {
  it('既定値で読み取る', () => {
    const config = parseConfig(['--user', 'kida']);
    assert.equal(config.user, 'kida');
    assert.equal(config.maxPages, DEFAULT_MAX_PAGES);
    assert.deepEqual(config.noteKeys, []);
    assert.equal(config.outDir, 'fixtures');
    assert.equal(config.dryRun, false);
  });

  it('--notes を分割し、重複を除く', () => {
    const config = parseConfig(['--user', 'kida', '--notes', 'n123abc, n456def,n123abc']);
    assert.deepEqual(config.noteKeys, ['n123abc', 'n456def']);
  });

  it('--user がない・不正なら拒否する', () => {
    assert.throws(() => parseConfig([]), ConfigError);
    assert.throws(() => parseConfig(['--user', '../etc']), ConfigError);
    assert.throws(() => parseConfig(['--user', 'a b']), ConfigError);
  });

  it('--max-pages の上限を超える値は拒否する', () => {
    assert.equal(parseConfig(['--user', 'k', '--max-pages', String(MAX_PAGES_LIMIT)]).maxPages, MAX_PAGES_LIMIT);
    assert.throws(() => parseConfig(['--user', 'k', '--max-pages', String(MAX_PAGES_LIMIT + 1)]), ConfigError);
    assert.throws(() => parseConfig(['--user', 'k', '--max-pages', '0']), ConfigError);
    assert.throws(() => parseConfig(['--user', 'k', '--max-pages', '1.5']), ConfigError);
  });

  it('記事キーの件数と形式を検証する', () => {
    assert.throws(() => parseConfig(['--user', 'k', '--notes', 'a,b,c,d,e,f']), ConfigError);
    assert.throws(() => parseConfig(['--user', 'k', '--notes', 'n1/../x']), ConfigError);
  });

  it('未知のオプションは拒否する', () => {
    assert.throws(() => parseConfig(['--user', 'k', '--yes']), ConfigError);
  });

  it('--help では --user がなくてもよい', () => {
    assert.equal(parseConfig(['--help']).help, true);
  });
});

describe('URL', () => {
  it('計画どおりのエンドポイントを組み立てる', () => {
    assert.equal(contentsRequest('kida', 2).url, 'https://note.com/api/v2/creators/kida/contents?kind=note&page=2');
    assert.equal(contentsRequest('kida', 2).file, 'contents/page-2.json');
    assert.equal(noteRequest('n123').url, 'https://note.com/api/v3/notes/n123');
    assert.equal(rssRequest('kida').url, 'https://note.com/kida/rss');
  });

  it('note.com の https 以外への送信を拒否する', () => {
    assert.doesNotThrow(() => assertNoteUrl('https://note.com/api/v3/notes/n1'));
    assert.throws(() => assertNoteUrl('http://note.com/x'));
    assert.throws(() => assertNoteUrl('https://evil.example/x'));
    assert.throws(() => assertNoteUrl('https://note.com.evil.example/x'));
    assert.throws(() => assertNoteUrl('https://note.com:8443/x'));
  });
});

describe('shouldFetchNextPage', () => {
  it('isLastPage が true なら止める', () => {
    assert.equal(shouldFetchNextPage({ data: { contents: [{ key: 'n1' }], isLastPage: true } }), false);
  });
  it('記事があり最終ページでなければ続ける', () => {
    assert.equal(shouldFetchNextPage({ data: { contents: [{ key: 'n1' }], isLastPage: false } }), true);
  });
  it('空・想定外の形・取得失敗なら止める', () => {
    assert.equal(shouldFetchNextPage({ data: { contents: [] } }), false);
    assert.equal(shouldFetchNextPage({ contents: [{ key: 'n1' }] }), false);
    assert.equal(shouldFetchNextPage(undefined), false);
    assert.equal(shouldFetchNextPage('x'), false);
  });
});

describe('pickNoteKeys', () => {
  it('無料と有料を1件ずつ選ぶ', () => {
    const json = {
      data: {
        contents: [
          { key: 'nfree1', price: 0 },
          { key: 'nfree2' },
          { key: 'npaid1', price: 300 },
          { key: 'npaid2', price: 500 },
        ],
      },
    };
    assert.deepEqual(pickNoteKeys(json), ['nfree1', 'npaid1']);
  });
  it('有料記事がなければ無料記事だけ', () => {
    assert.deepEqual(pickNoteKeys({ data: { contents: [{ key: 'nfree1' }] } }), ['nfree1']);
  });
  it('不正なキーや想定外の形は無視する', () => {
    assert.deepEqual(pickNoteKeys({ data: { contents: [{ key: '../x' }, { key: 1 }, null] } }), []);
    assert.deepEqual(pickNoteKeys(undefined), []);
  });
});

describe('isSensitiveKey', () => {
  it('キー名をトークンに分ける', () => {
    assert.deepEqual(keyTokens('userEmailAddress'), ['user', 'email', 'address']);
    assert.deepEqual(keyTokens('csrf_token'), ['csrf', 'token']);
    assert.deepEqual(keyTokens('like-users'), ['like', 'users']);
  });

  it('機微なキーを検出する', () => {
    for (const key of [
      'email',
      'userEmail',
      'mail_address',
      'phone',
      'csrfToken',
      'session_id',
      'ipAddress',
      'realName',
      'likers',
      'comments',
      'accessKey',
      'likes',
      'content_raters',
      'contentRaters',
    ]) {
      assert.equal(isSensitiveKey(key), true, key);
    }
  });

  it('記事表示に必要そうなキーは残す', () => {
    for (const key of [
      'author',
      'name',
      'nickname',
      'urlname',
      'body',
      'key',
      'price',
      'commentCount',
      'likeCount',
      'like_count',
      'anonymousLikeCount',
      'rater_count',
      'eyecatch',
      'publishAt',
      'hashtags',
      'description',
    ]) {
      assert.equal(isSensitiveKey(key), false, key);
    }
  });
});

describe('stripSensitive', () => {
  it('機微なキーを削除し、パスを記録する', () => {
    const input = {
      data: {
        name: 'タイトル',
        user: { nickname: 'KIDA', email: 'me@example.com' },
        likers: [{ nickname: 'other' }],
        items: [{ csrfToken: 'x', keep: 1 }],
      },
    };
    const result = stripSensitive(input);
    assert.deepEqual(result.value, {
      data: { name: 'タイトル', user: { nickname: 'KIDA' }, items: [{ keep: 1 }] },
    });
    assert.deepEqual(result.removedKeys.sort(), ['$.data.items[0].csrfToken', '$.data.likers', '$.data.user.email']);
  });

  it('文字列中のメールアドレスを伏せる', () => {
    const result = stripSensitive({ body: '<p>連絡は foo.bar@example.co.jp まで</p>', n: 1, b: null });
    assert.deepEqual(result.value, { body: `<p>連絡は ${REDACTED_EMAIL} まで</p>`, n: 1, b: null });
    assert.deepEqual(result.redactedPaths, ['$.body']);
  });

  it('入力を変更しない', () => {
    const input = { email: 'a@b.cd' };
    stripSensitive(input);
    assert.deepEqual(input, { email: 'a@b.cd' });
  });
});

describe('waitBeforeNext', () => {
  it('初回は待たない', () => {
    assert.equal(waitBeforeNext(undefined, 1000), 0);
  });
  it('前回から1秒経つまで待つ', () => {
    assert.equal(waitBeforeNext(1000, 1300), 700);
    assert.equal(waitBeforeNext(1000, 2000), 0);
    assert.equal(waitBeforeNext(1000, 5000), 0);
  });
});
