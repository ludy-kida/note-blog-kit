#!/usr/bin/env node
/**
 * npm pack した配布物（tarball）を一時ディレクトリに入れ、利用者と同じ形で動くか確かめる（#50。CI 用）。
 * 事前に `pnpm build` でライブラリをビルドしておくこと。
 *
 * - 依存（zod・sanitize-html・react）は npm のレジストリから取得する。note にはアクセスしない
 * - 各 subpath を import（ESM）と require（require(esm)）で読み、代表的な export が関数であること
 * - `note-blog-kit/styles.css` が解決できること
 * - CLI の `note-blog-kit --help`・`note-blog-kit sync --help` が終了コード 0 で終わること
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'packages/note-blog-kit');
const work = mkdtempSync(join(tmpdir(), 'nbk-pack-'));

function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} が終了コード ${result.status} で終わりました`);
}

try {
  run('pnpm', ['pack', '--pack-destination', work], pkgDir);
  const tarball = readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw new Error('tarball が作られませんでした');

  const app = join(work, 'app');
  mkdirSync(app);
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'nbk-pack-check', private: true, type: 'module' })}\n`,
  );
  run(
    'npm',
    ['install', '--no-audit', '--no-fund', '--loglevel=error', join(work, tarball), 'react@19', 'react-dom@19'],
    app,
  );

  // require(esm)：リポジトリの確認スクリプトをコピーし、入れた配布物に対して実行する
  copyFileSync(join(pkgDir, 'scripts/check-require.cjs'), join(app, 'check-require.cjs'));
  run('node', ['check-require.cjs'], app);

  // ESM：同じ一覧を import で確かめる
  writeFileSync(
    join(app, 'check-import.mjs'),
    `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { expected, checkModule } = require('./check-require.cjs');
for (const id of Object.keys(expected)) checkModule(id, await import(id), 'import');
import.meta.resolve('note-blog-kit/styles.css');
console.log('import (ESM): OK');
`,
  );
  run('node', ['check-import.mjs'], app);

  const bin = join(app, 'node_modules/.bin/note-blog-kit');
  run(bin, ['--help'], app);
  run(bin, ['sync', '--help'], app);
  console.log('check:pack: OK');
} finally {
  rmSync(work, { recursive: true, force: true });
}
