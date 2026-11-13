#!/usr/bin/env node
/**
 * examples をビルドし、起動して表示を確かめる（CI 用）。事前に `pnpm build` でライブラリをビルドしておくこと。
 *
 * - fixture モード（examples の既定）で動かし、note にはアクセスしない。実通信を有効にする NOTE_BLOG_KIT_LIVE は必ず外す
 * - 成功指標「Next.js の一覧ページを30行以内」を、examples/next/app/page.tsx の行数で確認する
 * - 一覧ページは動的ページのため `next build` では実行されない。ビルド後に `next start` で起動し、
 *   fixture の取得から描画までが動くこと（一覧が出る・範囲外が 404 になる）を HTTP で確かめる
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exampleDir = join(root, 'examples/next');
const MAX_PAGE_LINES = 30;
const PORT = 3457;

const pagePath = join(exampleDir, 'app/page.tsx');
const lines = readFileSync(pagePath, 'utf8').trimEnd().split('\n').length;
if (lines > MAX_PAGE_LINES) {
  console.error(`examples/next/app/page.tsx が ${lines} 行あります（上限 ${MAX_PAGE_LINES} 行）`);
  process.exit(1);
}
console.log(`examples/next/app/page.tsx: ${lines} 行（上限 ${MAX_PAGE_LINES} 行）`);

const { NOTE_BLOG_KIT_LIVE: _live, NOTE_USER: _user, ...baseEnv } = process.env;
const env = { ...baseEnv, NEXT_TELEMETRY_DISABLED: '1' };

const build = spawnSync('pnpm', ['-C', 'examples/next', 'build'], { cwd: root, stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status ?? 1);

/** 起動して確かめるページと、期待するステータス・本文 */
const CHECKS = [
  { path: '/', status: 200, includes: ['nbk-article-list', 'nbk-pagination__next', '1 / 3'] },
  { path: '/?page=3', status: 200, includes: ['nbk-article-list', '3 / 3'], excludes: ['nbk-pagination__next'] },
  { path: '/?page=4', status: 404 },
  { path: '/?page=abc', status: 404 },
];

// 子プロセスごと止められるよう、独立したプロセスグループで起動する
const server = spawn(join(exampleDir, 'node_modules/.bin/next'), ['start', '-p', String(PORT)], {
  cwd: exampleDir,
  env,
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // すでに終了している
  }
};

let failed = false;
try {
  const base = `http://localhost:${PORT}`;
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    try {
      ready = (await fetch(base)).status > 0;
    } catch {
      await sleep(500);
    }
  }
  if (!ready) throw new Error('examples/next が起動しませんでした');

  for (const check of CHECKS) {
    const response = await fetch(base + check.path);
    const body = await response.text();
    const problems = [];
    if (response.status !== check.status) problems.push(`ステータス ${response.status}（期待 ${check.status}）`);
    for (const text of check.includes ?? []) if (!body.includes(text)) problems.push(`「${text}」がない`);
    for (const text of check.excludes ?? []) if (body.includes(text)) problems.push(`「${text}」がある`);
    if (problems.length > 0) {
      failed = true;
      console.error(`NG ${check.path}: ${problems.join('、')}`);
    } else {
      console.log(`OK ${check.path}（${response.status}）`);
    }
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
