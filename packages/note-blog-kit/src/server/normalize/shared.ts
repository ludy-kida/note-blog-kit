/** 正規化で共通に使う検証（内部用） */
import { z } from 'zod';

/**
 * https の絶対 URL か。描画側（href・src）に `javascript:` などを渡さないため、ここで検証する。
 * 前後の空白や制御文字を含む値は、ブラウザが除去して別のスキームとして解釈しうるため受け付けない。
 */
function hasControlOrSpace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return /\s/.test(value);
}

export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://') || hasControlOrSpace(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const httpsUrl = z.string().refine(isHttpsUrl, 'https の URL ではありません');
/** 画像 URL。空文字は「画像なし」として許す */
export const optionalHttpsUrl = z
  .string()
  .refine((value) => value.trim() === '' || isHttpsUrl(value), 'https の URL ではありません');

/** 空文字を null にそろえる（fixture では null の例がないため、null は受け付けずスキーマエラーにする） */
export function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/** 抜粋の長さ（一覧 API の body と同じ 240 文字） */
const EXCERPT_LENGTH = 240;

/** 終わりを空白にする要素（テキストにしたときに文がつながらないように） */
const BLOCK_TAGS = new Set([
  'br',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'figure',
  'figcaption',
  'pre',
  'td',
  'th',
  'tr',
  'div',
]);
/** 中身ごと捨てる要素（テキストとして意味がない） */
const DROP_TAGS = new Set(['script', 'style']);

/**
 * タグ・コメントを除いたテキストにする。正規表現の後戻りを使わず、入力長に比例する時間で終わる
 * （RSS の description は未サニタイズの HTML なので、閉じていない `<` が大量にあっても遅くならないように）
 */
function stripTags(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let position = 0;
  while (position < html.length) {
    const lt = html.indexOf('<', position);
    if (lt === -1) return out + html.slice(position);
    out += html.slice(position, lt);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) return out;
      out += ' ';
      position = end + 3;
      continue;
    }
    const gt = html.indexOf('>', lt + 1);
    // これより後にタグはない。残りはテキスト
    if (gt === -1) return out + html.slice(lt);
    const inner = lower.slice(lt + 1, gt);
    const closing = inner.startsWith('/');
    const name = /^\/?([a-z][a-z0-9]*)/.exec(inner)?.[1] ?? '';
    position = gt + 1;
    if (!closing && DROP_TAGS.has(name)) {
      const end = lower.indexOf(`</${name}`, position);
      const endGt = end === -1 ? -1 : lower.indexOf('>', end);
      if (endGt === -1) return out;
      out += ' ';
      position = endGt + 1;
      continue;
    }
    if (BLOCK_TAGS.has(name) && (closing || name === 'br')) out += ' ';
  }
  return out;
}

/**
 * HTML からタグを除き、空白をまとめたテキストの先頭（240 文字）を作る。
 * 結果はプレーンテキスト（`<` などがそのまま入りうるので、HTML として挿入しないこと）
 */
export function htmlToExcerpt(html: string): string {
  const text = stripTags(html)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, EXCERPT_LENGTH).join('');
}
