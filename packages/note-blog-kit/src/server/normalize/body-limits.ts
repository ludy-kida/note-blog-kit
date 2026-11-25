/**
 * 本文 HTML の大きさの上限（内部用）。サニタイズ（sanitize-html）の前に確かめる。
 *
 * sanitize-html には、入力によって処理時間が2乗で増える経路がある。
 * - タグの入れ子が深い：sanitizeNoteBody が、パーサーの数えた深さで MAX_BODY_DEPTH を超えたら中断する
 * - 消す要素（div・src のない img）が多い：消すたびにそれまでの出力全体をコピーする。
 *   ここで本文の長さと、消しうるタグの数に上限を設ける（最悪でも約 0.3 秒）
 */
import { NoteSchemaError } from '../errors.js';

/** 本文の最大の長さ（文字数）。fixture の本文は最大 2万字程度 */
export const MAX_BODY_LENGTH = 300_000;
/** サニタイズで消しうる要素（`<img>`・`<div>`）の最大数。fixture では div は 0 個、タグは全部で最大 217 個 */
export const MAX_REMOVED_TAGS = 2_000;

/** `<img`・`<div` で始まるタグ（`<imgx` なども数える。多めに数える側に倒す） */
const REMOVABLE_TAG_RE = /<(?:img|div)/gi;

function tooLarge(message: string): NoteSchemaError {
  return new NoteSchemaError('The article body is too large', { issues: [{ path: 'data.body', message }] });
}

/**
 * 本文が上限を超えていないか確かめる（入れ子の深さは sanitizeNoteBody が確かめる）。
 * @throws {NoteSchemaError} 長さか、消しうるタグの数が上限を超えたとき
 */
export function assertBodyWithinLimits(html: string): void {
  if (html.length > MAX_BODY_LENGTH) throw tooLarge(`Body is longer than ${MAX_BODY_LENGTH} characters`);
  let count = 0;
  for (const _ of html.matchAll(REMOVABLE_TAG_RE)) {
    if (++count > MAX_REMOVED_TAGS) throw tooLarge(`Body has more than ${MAX_REMOVED_TAGS} img or div tags`);
  }
}
