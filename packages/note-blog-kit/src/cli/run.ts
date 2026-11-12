import { parseArgs } from 'node:util';

const USAGE = `使い方: note-blog-kit <command>

コマンド:
  sync   記事を取得して JSON に書き出す（Phase 4 で実装予定）`;

export function run(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: { help: { type: 'boolean', short: 'h' } },
  });
  const [command] = positionals;
  if (values.help === true || command === undefined) {
    console.log(USAGE);
    return 0;
  }
  if (command === 'sync') {
    console.error('sync はまだ実装されていません。');
    return 1;
  }
  console.error(`不明なコマンドです: ${command}\n\n${USAGE}`);
  return 2;
}
