import { runSync } from './sync.js';
import type { CliDeps } from './types.js';

const USAGE = `使い方: note-blog-kit <command>

コマンド:
  sync   記事の一覧と本文を JSON に書き出す（詳しくは note-blog-kit sync --help）`;

export async function run(argv: string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    stdout(USAGE);
    return 0;
  }
  if (command === 'sync') return runSync(rest, deps);
  stderr(`不明なコマンドです: ${command}\n\n${USAGE}`);
  return 2;
}
