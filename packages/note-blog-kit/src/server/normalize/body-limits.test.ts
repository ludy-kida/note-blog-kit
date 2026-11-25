import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NoteSchemaError } from '../errors.js';
import { assertBodyWithinLimits, MAX_BODY_DEPTH, MAX_BODY_LENGTH, measureNestingDepth } from './body-limits.js';

const noteBody = (path: string): string =>
  (
    JSON.parse(readFileSync(new URL(`../../../../../fixtures/${path}.json`, import.meta.url), 'utf8')) as {
      data: { body: string };
    }
  ).data.body;

const ONE_MB = 1_000_000;
const fill = (unit: string): string => unit.repeat(Math.floor(ONE_MB / unit.length));

/** 例外を返し、かかった時間（ミリ秒）も返す */
function run(html: string): { error: unknown; ms: number } {
  const start = performance.now();
  let error: unknown;
  try {
    assertBodyWithinLimits(html);
  } catch (e) {
    error = e;
  }
  return { error, ms: performance.now() - start };
}

describe('assertBodyWithinLimits', () => {
  it('攻撃パターン（約 1MB）は NoteSchemaError になり、1 秒以内に終わる', () => {
    for (const html of [fill('<div>'), fill('<svg></svgx>'), fill('<div/>'), fill('<p><span>')]) {
      const { error, ms } = run(html);
      expect(error, html.slice(0, 20)).toBeInstanceOf(NoteSchemaError);
      expect((error as NoteSchemaError).issues[0]?.path).toBe('data.body');
      expect(ms).toBeLessThan(1000);
    }
  });

  it(`${MAX_BODY_LENGTH} 文字を超える本文は NoteSchemaError`, () => {
    expect(() => assertBodyWithinLimits('a'.repeat(MAX_BODY_LENGTH))).not.toThrow();
    expect(() => assertBodyWithinLimits('a'.repeat(MAX_BODY_LENGTH + 1))).toThrow(NoteSchemaError);
  });

  it(`入れ子の深さは ${MAX_BODY_DEPTH} まで`, () => {
    expect(() => assertBodyWithinLimits('<div>'.repeat(MAX_BODY_DEPTH))).not.toThrow();
    expect(() => assertBodyWithinLimits('<div>'.repeat(MAX_BODY_DEPTH + 1))).toThrow(NoteSchemaError);
  });

  it('fixture の本文は通る（深さに十分な余裕がある）', () => {
    for (const path of ['notes/n55256baa5425', 'notes/n52a7f4fa0a2e', '2026-11-17/notes/n739726ca45e7']) {
      const body = noteBody(path);
      expect(() => assertBodyWithinLimits(body)).not.toThrow();
      expect(measureNestingDepth(body), path).toBeLessThan(MAX_BODY_DEPTH / 8);
    }
  });
});

describe('measureNestingDepth', () => {
  it('void 要素と、正しく閉じたタグの繰り返しは段数を増やさない', () => {
    expect(measureNestingDepth('<p>a<br>b<img src="x"><hr></p>'.repeat(1000))).toBe(1);
    expect(measureNestingDepth('<ul><li><a href="#">x</a></li></ul>'.repeat(1000))).toBe(3);
    expect(measureNestingDepth('<P>x</p>')).toBe(1);
  });

  it('見積もりは安全側：閉じていないタグ・名前の違う閉じタグ・自己終了の書き方は段数を減らさない', () => {
    expect(measureNestingDepth('<svg></svgx>'.repeat(10))).toBe(10);
    expect(measureNestingDepth('<div/>'.repeat(10))).toBe(10);
    expect(measureNestingDepth('</div></div><div>')).toBe(1);
  });

  it('閉じタグは、同じ名前のタグまでまとめて閉じる', () => {
    expect(measureNestingDepth('<div><span><b>x</div><p>')).toBe(3);
    expect(measureNestingDepth('<div><span><b>x</div>')).toBe(3);
    expect(measureNestingDepth('<div><span><b>x</div><div>')).toBe(3);
  });
});
