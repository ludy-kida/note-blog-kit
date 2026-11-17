import { describe, expect, it } from 'vitest';
import { NOTE_KEY_RE, NOTE_USER_RE } from './patterns.js';

describe('patterns', () => {
  it('記事キー：n と英小文字・数字（1〜32文字）だけ', () => {
    for (const ok of ['n55256baa5425', 'n1', `n${'a'.repeat(32)}`]) expect(NOTE_KEY_RE.test(ok), ok).toBe(true);
    for (const ng of [
      '',
      'n',
      `n${'a'.repeat(33)}`,
      'n55256baa5425\n',
      ' n55256baa5425',
      'N55256BAA5425',
      'ｎabc',
      'n1/2',
    ]) {
      expect(NOTE_KEY_RE.test(ng), JSON.stringify(ng)).toBe(false);
    }
  });

  it('ユーザー名：英数字・_・-（1〜64文字）だけ', () => {
    for (const ok of ['kida_lw', 'A-b_1', 'a'.repeat(64)]) expect(NOTE_USER_RE.test(ok), ok).toBe(true);
    for (const ng of ['', 'a'.repeat(65), 'abc\n', 'ａｂｃ', 'a b', 'a/../b']) {
      expect(NOTE_USER_RE.test(ng), JSON.stringify(ng)).toBe(false);
    }
  });

  it('g・y・m フラグを付けない（lastIndex の状態と、改行の前での一致を避ける）', () => {
    for (const re of [NOTE_KEY_RE, NOTE_USER_RE]) expect(re.flags).toBe('');
  });
});
