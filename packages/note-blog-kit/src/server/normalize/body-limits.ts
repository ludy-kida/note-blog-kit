/**
 * 本文 HTML の大きさの上限（内部用）。サニタイズ（sanitize-html）の前に確かめる。
 *
 * sanitize-html の処理時間はタグの入れ子の深さに比例して2乗で増える（50万文字の入れ子で数秒）。
 * 細工した本文でサーバーを止められないよう、長さと入れ子の深さに上限を設ける。
 * 深さは実際のパーサーより深く数える側（安全側）で見積もる。
 */
import { NoteSchemaError } from '../errors.js';

/** 本文の最大の長さ（文字数）。fixture の本文は最大 2万字程度 */
export const MAX_BODY_LENGTH = 1_000_000;
/** 本文の入れ子の最大の深さ。深さ 256 なら 1MB でもサニタイズは 0.2 秒程度 */
export const MAX_BODY_DEPTH = 256;

/** 閉じタグを持たない要素（段数に数えない） */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** 開きタグ（<name）または閉じタグ（</name）の先頭 */
const TAG_RE = /<(\/?)([A-Za-z][^\s/>]*)/g;

/**
 * 開いたままのタグの段数の最大値を、入力長に比例する時間で見積もる。
 * - 開きタグは void 要素以外をすべて1段と数える（`<div/>` も1段。HTML では自己終了と扱われない）
 * - 閉じタグは、同じ名前のタグが開いていればそこまで閉じ、開いていなければ無視する
 * - コメントや script の中の `<` も数える
 */
export function measureNestingDepth(html: string): number {
  const stack: string[] = [];
  const open = new Map<string, number>();
  let max = 0;
  for (const match of html.matchAll(TAG_RE)) {
    const name = (match[2] ?? '').toLowerCase();
    if (match[1] === '') {
      if (VOID_ELEMENTS.has(name)) continue;
      stack.push(name);
      open.set(name, (open.get(name) ?? 0) + 1);
      if (stack.length > max) max = stack.length;
      continue;
    }
    if (!open.get(name)) continue;
    // 同じ名前のタグまでまとめて閉じる（各タグは1回しか取り出さないので全体で線形）
    while (stack.length > 0) {
      const top = stack.pop() as string;
      open.set(top, (open.get(top) ?? 1) - 1);
      if (top === name) break;
    }
  }
  return max;
}

/**
 * 本文が上限を超えていないか確かめる。
 * @throws {NoteSchemaError} 長さか入れ子の深さが上限を超えたとき
 */
export function assertBodyWithinLimits(html: string): void {
  if (html.length > MAX_BODY_LENGTH) {
    throw new NoteSchemaError('The article body is too large', {
      issues: [{ path: 'data.body', message: `Body is longer than ${MAX_BODY_LENGTH} characters` }],
    });
  }
  if (measureNestingDepth(html) > MAX_BODY_DEPTH) {
    throw new NoteSchemaError('The article body is too large', {
      issues: [{ path: 'data.body', message: `Body is nested deeper than ${MAX_BODY_DEPTH} levels` }],
    });
  }
}
