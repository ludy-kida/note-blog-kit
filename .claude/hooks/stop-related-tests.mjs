#!/usr/bin/env node
/**
 * Stop hook: 終了前に、変更に関係するテスト（vitest --changed）を実行する。
 * 失敗したら exit 2 で結果を返し、エージェントに修正を続けさせる。
 * 2回目の Stop（stop_hook_active）では無限ループを避けるため何もしない。
 */
import { spawnSync } from 'node:child_process';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const input = JSON.parse((await readStdin()) || '{}');
if (input?.stop_hook_active === true) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '--changed', '--passWithNoTests'], {
  cwd: root,
  encoding: 'utf8',
});
if (result.status !== 0) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
  process.stderr.write(`変更に関係するテストが失敗しています。直してから終了してください。\n\n${output}\n`);
  process.exit(2);
}
process.exit(0);
