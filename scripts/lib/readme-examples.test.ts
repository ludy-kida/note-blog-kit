import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractCodeExamples } from './readme-examples.mjs';

describe('extractCodeExamples', () => {
  it('ts と tsx のブロックだけを、README の行番号と一緒に取り出す', () => {
    const readme = [
      '# t', // 1
      '```bash', // 2
      'npm i x', // 3
      '```', // 4
      '```ts', // 5
      'const a = 1;', // 6
      '```', // 7
      '```css', // 8
      'a {}', // 9
      '```', // 10
      '```tsx', // 11
      'export const B = () => <p />;', // 12
      'export {};', // 13
      '```', // 14
    ].join('\n');
    expect(extractCodeExamples(readme)).toEqual([
      { lang: 'ts', line: 6, code: 'const a = 1;\n' },
      { lang: 'tsx', line: 12, code: 'export const B = () => <p />;\nexport {};\n' },
    ]);
  });

  it('情報文字列に nocheck が付いたブロックは取り出さない', () => {
    const readme = '```ts nocheck\nfoo;\n```\n```ts\nbar;\n```\n';
    expect(extractCodeExamples(readme)).toEqual([{ lang: 'ts', line: 5, code: 'bar;\n' }]);
  });

  it('インデントされたブロック（リストの中）も取り出す', () => {
    const readme = '- 項目\n\n  ```ts\n  const a = 1;\n  ```\n';
    expect(extractCodeExamples(readme)).toEqual([{ lang: 'ts', line: 4, code: 'const a = 1;\n' }]);
  });

  it('ルートの README から、型チェックするブロックが取り出せる', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(extractCodeExamples(readme).length).toBeGreaterThan(5);
  });
});
