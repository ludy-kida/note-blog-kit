import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TAGS,
  DISCARD_VOID,
  DISCARD_WITH_CONTENT,
  IMAGE_HOST,
  IMAGE_PREFIX,
  SAFE_VALUE,
} from './body-policy.js';

// 本文の許可リスト（/server の sanitize と /react の描画が共有する）。
// この一覧の変更は人の承認が必要（CLAUDE.md・CODEOWNERS）。値を変えたらこのテストにも差分が出るようにしている
describe('本文の許可リスト（#47）', () => {
  it('許可するタグ', () => {
    expect([...ALLOWED_TAGS]).toEqual([
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      's',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'figure',
      'figcaption',
      'img',
      'pre',
      'code',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
    ]);
  });

  it('中身ごと捨てる要素（void 要素は含めない。/react が閉じタグまで読み飛ばすため）', () => {
    expect([...DISCARD_WITH_CONTENT]).toEqual([
      'script',
      'style',
      'iframe',
      'frame',
      'frameset',
      'object',
      'applet',
      'form',
      'button',
      'textarea',
      'select',
      'option',
      'svg',
      'math',
      'template',
      'noscript',
      'title',
      'xmp',
      'plaintext',
      'noembed',
      'noframes',
    ]);
    const voids = [
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
    ];
    expect(DISCARD_WITH_CONTENT.filter((tag) => voids.includes(tag))).toEqual([]);
    // 消す void 要素（中身はない。/server は nonTextTags に入れ、/react は許可しないタグとして消す）
    expect([...DISCARD_VOID]).toEqual(['embed', 'input', 'meta', 'link', 'base']);
    expect(DISCARD_VOID.every((tag) => voids.includes(tag))).toBe(true);
  });

  it('許可するタグと消す要素は重ならない', () => {
    expect([...DISCARD_WITH_CONTENT, ...DISCARD_VOID].filter((tag) => ALLOWED_TAGS.includes(tag))).toEqual([]);
  });

  it('画像の読み込み元と、属性値に使える文字', () => {
    expect(IMAGE_HOST).toBe('assets.st-note' + '.com');
    expect(IMAGE_PREFIX).toBe(`https://${IMAGE_HOST}/`);
    expect(SAFE_VALUE.test('emb-1_a.b:c/d')).toBe(true);
    expect(SAFE_VALUE.test('a b')).toBe(false);
    expect(SAFE_VALUE.test('"x"')).toBe(false);
  });
});
