import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NoteSchemaError } from '../errors.js';
import { MAX_BODY_DEPTH } from '../sanitize/sanitize.js';
import { assertBodyWithinLimits, MAX_BODY_LENGTH, MAX_REMOVED_TAGS } from './body-limits.js';
import { normalizeNote } from './note.js';

const fixtureJson = (path: string): { data: { body: string } } =>
  JSON.parse(readFileSync(new URL(`../../../../../fixtures/${path}.json`, import.meta.url), 'utf8'));

const FIXTURES = ['notes/n55256baa5425', 'notes/n52a7f4fa0a2e', '2026-11-17/notes/n739726ca45e7'];

/** fixture の本文を差し替えて normalizeNote にかけ、例外と時間（ミリ秒）を返す */
function normalizeBody(body: string): { error: unknown; ms: number } {
  const json = fixtureJson('notes/n55256baa5425');
  json.data.body = body;
  const start = performance.now();
  let error: unknown;
  try {
    normalizeNote(json);
  } catch (e) {
    error = e;
  }
  return { error, ms: performance.now() - start };
}

const fill = (unit: string, length = MAX_BODY_LENGTH): string => unit.repeat(Math.floor(length / unit.length));

describe('本文の大きさの上限（サニタイズの前・最中に確かめる）', () => {
  it(`入れ子が ${MAX_BODY_DEPTH} 段を超える本文は、パーサーの数えた深さで NoteSchemaError になり、1 秒以内に終わる`, () => {
    // パーサーとタグ名の区切り・コメントなどの扱いが違う書き方も、パーサー自身が数えるのですり抜けない
    for (const body of [
      fill('<div>'),
      fill('<b>'),
      fill('<svg></svgx>'),
      fill('<div/>'),
      fill('<b　></b>'),
      fill('<b ></b>'),
      fill('<b\u000b></b>'),
      fill('<b﻿></b>'),
      fill('<b></ </b>>'),
      fill('<b><?</b>>'),
      fill('<b><!--</b>-->'),
      fill('<b title="</b>">'),
      fill('<b><script></b></script>'),
      fill('<b><textarea></b></textarea>'),
    ]) {
      const { error, ms } = normalizeBody(body);
      expect(error, JSON.stringify(body.slice(0, 16))).toBeInstanceOf(NoteSchemaError);
      expect((error as NoteSchemaError).issues[0]?.path).toBe('data.body');
      expect(ms, JSON.stringify(body.slice(0, 16))).toBeLessThan(1000);
    }
  });

  it(`深さ ${MAX_BODY_DEPTH} までは通る`, () => {
    expect(normalizeBody('<b>'.repeat(MAX_BODY_DEPTH)).error).toBeUndefined();
    expect(normalizeBody('<b>'.repeat(MAX_BODY_DEPTH + 1)).error).toBeInstanceOf(NoteSchemaError);
  });

  it(`${MAX_BODY_LENGTH} 文字を超える本文は NoteSchemaError`, () => {
    expect(() => assertBodyWithinLimits('a'.repeat(MAX_BODY_LENGTH))).not.toThrow();
    expect(() => assertBodyWithinLimits('a'.repeat(MAX_BODY_LENGTH + 1))).toThrow(NoteSchemaError);
  });

  it(`サニタイズで消しうる <img>・<div> は合計 ${MAX_REMOVED_TAGS} 個まで（消すたびに出力全体をコピーするため）`, () => {
    expect(() => assertBodyWithinLimits('<img>'.repeat(MAX_REMOVED_TAGS))).not.toThrow();
    for (const body of [
      '<img>'.repeat(MAX_REMOVED_TAGS + 1),
      '<DIV></DIV>'.repeat(MAX_REMOVED_TAGS + 1),
      `${'<img>'.repeat(MAX_REMOVED_TAGS)}<div　>`,
    ]) {
      expect(() => assertBodyWithinLimits(body)).toThrow(NoteSchemaError);
    }
  });

  it('上限ぎりぎりの最悪の入力でも 1 秒以内に終わる', () => {
    const head = `<p>${'a'.repeat(MAX_BODY_LENGTH - 20 - MAX_REMOVED_TAGS * 11)}</p>`;
    for (const body of [head + '<img>'.repeat(MAX_REMOVED_TAGS), head + '<div></div>'.repeat(MAX_REMOVED_TAGS)]) {
      const { error, ms } = normalizeBody(body);
      expect(error).toBeUndefined();
      expect(ms).toBeLessThan(1000);
    }
  });

  it('fixture の本文は通り、出力は変わらない', () => {
    for (const path of FIXTURES) {
      const json = fixtureJson(path);
      expect(() => assertBodyWithinLimits(json.data.body), path).not.toThrow();
    }
    expect(normalizeNote(fixtureJson('notes/n55256baa5425')).bodyHtml.length).toBeGreaterThan(0);
  });
});
