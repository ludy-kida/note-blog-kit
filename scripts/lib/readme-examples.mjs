/**
 * README から、型チェックする TypeScript のコード例を取り出す（#51。scripts/check-readme-examples.mjs が使う）。
 * - ```ts と ```tsx のブロックだけ。情報文字列に nocheck が付いたもの（```ts nocheck）は除く
 * - リストの中などでインデントされたブロックは、開きのフェンスのインデントを各行から外す
 */
const FENCE_RE = /^( *)```(\S*)(.*)$/;

/** @param {string} readme */
export function extractCodeExamples(readme) {
  const lines = readme.split('\n');
  /** @type {{ lang: 'ts' | 'tsx'; line: number; code: string }[]} */
  const examples = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE_RE.exec(lines[i] ?? '');
    if (!open) continue;
    const indent = open[1] ?? '';
    const lang = open[2] ?? '';
    const info = (open[3] ?? '').trim().split(/\s+/);
    const body = [];
    let j = i + 1;
    while (j < lines.length && (lines[j] ?? '').trim() !== '```') {
      const text = lines[j] ?? '';
      body.push(text.startsWith(indent) ? text.slice(indent.length) : text);
      j += 1;
    }
    if ((lang === 'ts' || lang === 'tsx') && !info.includes('nocheck')) {
      examples.push({ lang, line: i + 2, code: body.map((text) => `${text}\n`).join('') });
    }
    i = j;
  }
  return examples;
}
