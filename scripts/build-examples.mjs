#!/usr/bin/env node
/**
 * examples をビルドする（CI 用）。事前に `pnpm build` でライブラリをビルドしておくこと。
 *
 * - fixture モード（examples の既定）で動かし、note にはアクセスしない。実通信を有効にする NOTE_BLOG_KIT_LIVE は必ず外す
 * - 成功指標「Next.js の一覧ページを30行以内」を、examples/next/app/page.tsx の行数で確認する
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PAGE_LINES = 30;

const pagePath = join(root, 'examples/next/app/page.tsx');
const lines = readFileSync(pagePath, 'utf8').trimEnd().split('\n').length;
if (lines > MAX_PAGE_LINES) {
  console.error(`examples/next/app/page.tsx が ${lines} 行あります（上限 ${MAX_PAGE_LINES} 行）`);
  process.exit(1);
}
console.log(`examples/next/app/page.tsx: ${lines} 行（上限 ${MAX_PAGE_LINES} 行）`);

const { NOTE_BLOG_KIT_LIVE: _live, ...env } = process.env;
const result = spawnSync('pnpm', ['-C', 'examples/next', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...env, NEXT_TELEMETRY_DISABLED: '1' },
});
process.exit(result.status ?? 1);
