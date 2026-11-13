import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const css = read('./styles.css');
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 文字列中の `nbk-` から始まるクラス名を集める */
function classNamesIn(text: string, pattern: RegExp): Set<string> {
  return new Set([...text.matchAll(pattern)].map((match) => match[1] ?? ''));
}

/** React コンポーネントが出力するクラス名（className="..." と classNames('...') の文字列） */
function componentClassNames(): Set<string> {
  const dir = new URL('../react/', import.meta.url);
  const sources = readdirSync(dir).filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'));
  const names = new Set<string>();
  for (const name of sources) {
    const code = readFileSync(new URL(name, dir), 'utf8');
    for (const match of code.matchAll(/['"`]([^'"`]*\bnbk-[^'"`]*)['"`]/g)) {
      for (const token of (match[1] ?? '').split(/\s+/)) {
        if (token.startsWith('nbk-')) names.add(token);
      }
    }
  }
  return names;
}

/** `@layer note-blog-kit { ... }` の中身と、それ以外の部分に分ける */
function splitLayer(source: string): { inside: string; outside: string } {
  const start = source.indexOf('@layer note-blog-kit');
  if (start === -1) return { inside: '', outside: source };
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) {
      return { inside: source.slice(open + 1, i), outside: source.slice(0, start) + source.slice(i + 1) };
    }
  }
  throw new Error('@layer の括弧が閉じていません');
}

describe('styles.css', () => {
  it('React コンポーネントのクラス名と CSS のクラス名が一致する', () => {
    const fromComponents = componentClassNames();
    const fromCss = classNamesIn(cssWithoutComments, /\.(nbk-[a-z0-9_-]+)/g);
    expect(fromComponents.size).toBeGreaterThan(10);
    expect(
      [...fromComponents].filter((name) => !fromCss.has(name)),
      'CSS にルールがないクラス名',
    ).toEqual([]);
    expect(
      [...fromCss].filter((name) => !fromComponents.has(name)),
      'コンポーネントにないクラス名',
    ).toEqual([]);
  });

  it('すべてのルールが @layer note-blog-kit の中にある', () => {
    const { inside, outside } = splitLayer(cssWithoutComments);
    expect(inside.trim()).not.toBe('');
    expect(outside.trim(), 'レイヤーの外にルールがある').toBe('');
  });

  it('使っている CSS 変数には :root に既定値がある', () => {
    const rootBlock = /:root\s*\{([^}]*)\}/.exec(cssWithoutComments)?.[1] ?? '';
    const defined = classNamesIn(rootBlock, /(--nbk-[a-z0-9-]+)\s*:/g);
    const used = classNamesIn(cssWithoutComments, /var\(\s*(--nbk-[a-z0-9-]+)/g);
    expect(
      [...used].filter((name) => !defined.has(name)),
      '既定値のない変数',
    ).toEqual([]);
    for (const name of [
      '--nbk-font-family',
      '--nbk-color-text',
      '--nbk-color-muted',
      '--nbk-color-accent',
      '--nbk-color-border',
      '--nbk-radius',
      '--nbk-gap',
    ]) {
      expect(defined.has(name), name).toBe(true);
    }
  });

  it('package.json から note-blog-kit/styles.css として読み込め、バンドラーに消されない', () => {
    const pkg = JSON.parse(read('../../package.json')) as {
      exports: Record<string, unknown>;
      sideEffects: unknown;
    };
    expect(pkg.exports['./styles.css']).toBe('./dist/styles.css');
    expect(Array.isArray(pkg.sideEffects) && pkg.sideEffects.some((glob) => String(glob).includes('.css'))).toBe(true);
  });
});
