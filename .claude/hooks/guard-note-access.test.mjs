import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { check } from './guard-note-access.mjs';

const bash = (command) => check({ tool_name: 'Bash', tool_input: { command } });
const webFetch = (url) => check({ tool_name: 'WebFetch', tool_input: { url, prompt: 'x' } });

describe('guard-note-access: WebFetch', () => {
  it('note.com とそのサブドメインをブロックする', () => {
    for (const url of [
      'https://note.com/kida/rss',
      'https://NOTE.com/api/v3/notes/n1',
      'https://assets.st-note.com/img.png',
      'http://note.mu/x',
      'https://www.note.com/',
    ]) {
      assert.notEqual(webFetch(url), null, url);
    }
  });
  it('似た名前の別ドメインは許可する', () => {
    for (const url of ['https://keynote.com/', 'https://note.com.example.org/', 'https://example.com/note.com']) {
      assert.equal(webFetch(url), null, url);
    }
  });
});

describe('guard-note-access: Bash', () => {
  it('note.com の URL を含むコマンドをブロックする', () => {
    for (const command of [
      'curl -s https://note.com/api/v2/creators/kida/contents',
      'wget https://note.com/kida/rss',
      `node -e "fetch('https://note.com/api/v3/notes/n1')"`,
      'python3 -c "import urllib.request; urllib.request.urlopen(\'https://note.com/x\')"',
      'echo https://note.com | xargs curl',
    ]) {
      assert.notEqual(bash(command), null, command);
    }
  });

  it('ネットワーク系コマンドとドメインの組み合わせをブロックする', () => {
    for (const command of ['curl note.com/kida/rss', 'http GET note.com/api/v3/notes/n1', 'nc note.com 443']) {
      assert.notEqual(bash(command), null, command);
    }
  });

  it('fixture 取得スクリプトの実行をブロックし、--dry-run は許可する', () => {
    assert.notEqual(bash('node scripts/record-fixtures.ts --user kida'), null);
    assert.notEqual(bash('pnpm fixtures:record --user kida'), null);
    assert.notEqual(bash('node scripts/record-fixtures.ts --user kida --dry-run-x'), null);
    assert.equal(bash('node scripts/record-fixtures.ts --user kida --dry-run'), null);
  });

  it('通常のコマンドは許可する', () => {
    for (const command of [
      'pnpm test',
      'git status',
      'grep -r "note.com" src',
      'cat fixtures/rss/feed.xml',
      'curl -s https://registry.npmjs.org/zod',
      'ls keynote.com',
    ]) {
      assert.equal(bash(command), null, command);
    }
  });

  it('他のツールには干渉しない', () => {
    assert.equal(check({ tool_name: 'Read', tool_input: { file_path: '/x' } }), null);
  });
});

describe('guard-note-access: プロセスとして実行', () => {
  const script = fileURLToPath(new URL('./guard-note-access.mjs', import.meta.url));
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });

  it('ブロック時は exit 2 で理由を stderr に出す', () => {
    const result = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'curl https://note.com' } }));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /note\.com/);
  });
  it('許可時は exit 0', () => {
    const result = run(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }));
    assert.equal(result.status, 0);
  });
  it('入力が壊れていれば安全側に倒して exit 2', () => {
    assert.equal(run('not json').status, 2);
  });
});
