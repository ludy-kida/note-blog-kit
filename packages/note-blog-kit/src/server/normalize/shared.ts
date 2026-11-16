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
