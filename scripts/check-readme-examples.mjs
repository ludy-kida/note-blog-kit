#!/usr/bin/env node
/**
 * README のコード例（```ts・```tsx）を取り出して型チェックする（#51。scripts/build-examples.mjs から実行する）。
 * 事前に `pnpm build` でライブラリをビルドしておくこと（note-blog-kit はビルド済みの型で解決する）。
 *
 * - 各ブロックを examples/next/.readme-examples/ に1ファイルずつ書き出す（next・react を解決できる場所）
 * - 断片で単独では型チェックできない例は、情報文字列に nocheck を付けて除く（```ts nocheck）
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCodeExamples } from './lib/readme-examples.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exampleDir = join(root, 'examples/next');
const outDir = join(exampleDir, '.readme-examples');

const examples = extractCodeExamples(readFileSync(join(root, 'README.md'), 'utf8'));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
/** 書き出したファイル名から README の行番号を引く */
const lineOf = new Map();
for (const example of examples) {
  const name = `readme-${String(example.line).padStart(4, '0')}.${example.lang}`;
  lineOf.set(name, example.line);
  // 各ファイルをモジュールとして扱う（import のない例でも、ほかの例と名前がぶつからないように）
  writeFileSync(join(outDir, name), `${example.code}\nexport {};\n`);
}

const result = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.readme-examples.json', '--pretty', 'false'], {
  cwd: exampleDir,
  encoding: 'utf8',
});
if (result.status !== 0) {
  // エラーの位置を README の行番号に読み替えて表示する
  const output = `${result.stdout}${result.stderr}`.replace(
    /\.readme-examples\/(readme-\d+\.tsx?)\((\d+),(\d+)\)/g,
    (_, name, line, column) => `README.md:${lineOf.get(name) + Number(line) - 1}:${column}`,
  );
  console.error(output);
  console.error('README のコード例に型エラーがあります（断片の例は ```ts nocheck で除けます）');
  process.exit(1);
}
console.log(`README のコード例: ${examples.length} 件の型チェックが通りました`);
