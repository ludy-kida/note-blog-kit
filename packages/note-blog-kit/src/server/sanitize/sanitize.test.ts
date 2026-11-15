import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESERVE_CASES, type SanitizeCase, UNSAFE_CASES } from './cases.js';
import { sanitizeNoteBody } from './sanitize.js';

function expectCase(c: SanitizeCase): void {
  const output = sanitizeNoteBody(c.input);
  const lower = output.toLowerCase();
  for (const s of c.mustNotContain) {
    expect(lower, `「${s}」が残っている：${output}`).not.toContain(s.toLowerCase());
  }
  for (const s of c.mustContain ?? []) {
    expect(output, `「${s}」がない：${output}`).toContain(s);
  }
}

describe('sanitizeNoteBody：無害化されるべき入力', () => {
  it.each(UNSAFE_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expectCase(c);
  });
});

describe('sanitizeNoteBody：残すべき入力', () => {
  it.each(PRESERVE_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expectCase(c);
  });
});

describe('sanitizeNoteBody：境界', () => {
  it('空文字はそのまま空文字を返す', () => {
    expect(sanitizeNoteBody('')).toBe('');
  });

  it('id のない出力は、もう一度通しても変わらない', () => {
    const once = sanitizeNoteBody('<p>本文<a href="https://example.com/" target="_blank">x</a></p>');
    expect(sanitizeNoteBody(once)).toBe(once);
  });

  it('目次の中のテキストや要素は捨てる', () => {
    expect(sanitizeNoteBody('<table-of-contents>文字<p>段落</p></table-of-contents><p>後</p>')).toBe(
      '<div data-nbk-toc></div><p>後</p>',
    );
  });

  it('本文中の div はタグだけ消す（目次の目印に見せかけられない）', () => {
    expect(sanitizeNoteBody('<div data-nbk-toc>文字</div>')).toBe('文字');
  });

  it('許可しない文字を含む id と埋め込みの属性は消す', () => {
    const output = sanitizeNoteBody(
      '<figure id="a b" embedded-service="note&quot;" embedded-content-key="k<1>" data-src="https://example.com/"></figure>',
    );
    expect(output).toBe('<figure data-nbk-embed-url="https://example.com/"></figure>');
  });

  it('埋め込みの属性は figure 以外では残さない', () => {
    expect(sanitizeNoteBody('<p embedded-service="note" data-src="https://example.com/">x</p>')).toBe('<p>x</p>');
  });

  it('target は _blank 以外を消す', () => {
    expect(sanitizeNoteBody('<a href="https://example.com/" target="_top">x</a>')).toBe(
      '<a href="https://example.com/">x</a>',
    );
  });

  it('href が無効でも target="_blank" には rel を付ける', () => {
    expect(sanitizeNoteBody('<a href="javascript:alert(1)" target="_blank">x</a>')).toBe(
      '<a target="_blank" rel="nofollow noopener noreferrer">x</a>',
    );
  });

  it('ポート付きの assets.st-note.com の画像は消す', () => {
    expect(sanitizeNoteBody('<img src="https://assets.st-note.com:8443/x.png">')).toBe('');
  });
});

const notes = ['n55256baa5425', 'n52a7f4fa0a2e'].map((key) => {
  const json = JSON.parse(
    readFileSync(new URL(`../../../../../fixtures/notes/${key}.json`, import.meta.url), 'utf8'),
  ) as { data: { body: string; index: { name: string }[] } };
  return [key, json.data] as const;
});

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>/]`, 'g')) ?? []).length;
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, '');
}

describe('sanitizeNoteBody：fixture の本文が崩れない', () => {
  it.each(notes)('%s', (_key, note) => {
    const output = sanitizeNoteBody(note.body);

    for (const tag of ['p', 'h2', 'h3', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'figure', 'img']) {
      expect(countTags(output, tag), tag).toBe(countTags(note.body, tag));
    }
    expect(countTags(output, 'table-of-contents')).toBe(0);
    expect((output.match(/<div data-nbk-toc><\/div>/g) ?? []).length).toBe(countTags(note.body, 'table-of-contents'));

    // テキストは失われない
    expect(textOf(output)).toBe(textOf(note.body));

    // 目次の項目は、nbk- を付けた見出しの id と一致する（有料記事の body は無料部分だけなので、body にある見出しに限る）
    const headings = note.index.filter((item) => note.body.includes(`id="${item.name}"`));
    for (const item of headings) {
      expect(output).toContain(`id="nbk-${item.name}"`);
    }
    expect(output).not.toMatch(/\sname=/);
  });
});
