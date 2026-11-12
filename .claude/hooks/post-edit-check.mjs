#!/usr/bin/env node
/**
 * PostToolUse hook（Edit|Write）: 編集したファイルを Biome で整形・lint し、
 * ライブラリのソースなら型チェックする。問題があれば exit 2 で内容をエージェントに返す。
 */
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const BIOME_TARGET = /\.(?:[cm]?[jt]sx?|json|jsonc|css)$/;
const PKG_SRC = 'packages/note-blog-kit/';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

const input = JSON.parse((await readStdin()) || '{}');
const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string') process.exit(0);

const rel = relative(root, resolve(root, filePath));
if (rel.startsWith('..') || rel.startsWith('fixtures/') || rel.startsWith('etc/') || !BIOME_TARGET.test(rel)) {
  process.exit(0);
}

const problems = [];
const biome = run('pnpm', ['exec', 'biome', 'check', '--write', '--no-errors-on-unmatched', rel]);
if (!biome.ok) problems.push(`Biome:\n${biome.output}`);

if (rel.startsWith(PKG_SRC) && /\.tsx?$/.test(rel)) {
  const tsc = run('pnpm', ['exec', 'tsc', '--noEmit', '-p', `${PKG_SRC}tsconfig.json`]);
  if (!tsc.ok) problems.push(`型チェック:\n${tsc.output}`);
}

if (problems.length > 0) {
  process.stderr.write(`${rel} に問題があります。直してください。\n\n${problems.join('\n\n')}\n`);
  process.exit(2);
}
process.exit(0);
