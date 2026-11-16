import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NoteSchemaError } from '../errors.js';
import { sanitizeNoteBody } from '../sanitize/sanitize.js';
import { normalizeNote } from './note.js';

type RawNote = { data: Record<string, unknown> & { body: string } };

const fixture = (key: string): RawNote =>
  JSON.parse(readFileSync(new URL(`../../../../../fixtures/notes/${key}.json`, import.meta.url), 'utf8')) as RawNote;

const FREE = 'n55256baa5425';
const PAID = 'n52a7f4fa0a2e';

describe('normalizeNote', () => {
  it('無料記事を NoteArticle に変換する', () => {
    const raw = fixture(FREE);
    const article = normalizeNote(raw);
    expect(article).toMatchObject({
      key: FREE,
      title: 'ノンアルコールワインをクリスマスに。乾杯用スパークリング3選',
      url: 'https://note.com/kida_lw/n/n55256baa5425',
      publishedAt: '2026-11-12T00:38:42.000Z',
      hashtags: ['クリスマス', '手土産', 'ソバーキュリアス', 'スパークリングワイン', 'ノンアルコールワイン'],
      likeCount: 0,
      price: 0,
      isPartial: false,
      source: 'api',
      author: { name: '木田貴之', urlname: 'kida_lw' },
    });
    expect(article.author.imageUrl).toMatch(/^https:\/\/assets\.st-note\.com\//);
  });

  it('bodyHtml は必ずサニタイズ済み', () => {
    for (const key of [FREE, PAID]) {
      const raw = fixture(key);
      const article = normalizeNote(raw);
      expect(article.bodyHtml).toBe(sanitizeNoteBody(raw.data.body));
      expect(article.bodyHtml).not.toMatch(/<script|\sname=|embedded-service=|<table-of-contents/);
    }
  });

  it('有料記事は isPartial: true、無料記事は false', () => {
    expect(normalizeNote(fixture(PAID)).isPartial).toBe(true);
    expect(normalizeNote(fixture(FREE)).isPartial).toBe(false);
  });

  it('eyecatch は幅・高さ・alt が fixture と一致する', () => {
    const article = normalizeNote(fixture(FREE));
    expect(article.eyecatch).toEqual({
      url: 'https://assets.st-note.com/production/uploads/images/335100586/rectangle_large_type_2_7c58efbf45938c6a7c6c44d30a45bccb.png?fit=bounds&quality=85&width=1280',
      width: 1280,
      height: 670,
      alt: '見出し画像',
    });
    expect(article.eyecatchUrl).toBe(article.eyecatch?.url);
  });

  it('toc は index[] から作り、id は本文の見出しと同じ nbk- 付き', () => {
    const article = normalizeNote(fixture(FREE));
    expect(article.toc).toHaveLength(7);
    expect(article.toc[0]).toEqual({ id: 'nbk-5bf2a080-2df1-423b-a0c1-37751fc7576c', text: '選ぶ基準', level: 3 });
    expect(article.toc.some((item) => item.level === 2)).toBe(true);
    for (const item of article.toc) {
      expect(article.bodyHtml).toContain(`id="${item.id}"`);
    }
  });

  it('有料記事の toc は有料部分の見出しも含めてすべて返す', () => {
    const article = normalizeNote(fixture(PAID));
    expect(article.toc).toHaveLength(31);
    expect(article.toc[0]).toEqual({
      id: 'nbk-84c8a2ce-be47-4981-b495-27256d2cd768',
      text: 'SEOを制するものはnoteを制する',
      level: 2,
    });
  });

  it('embeds は embedded_contents[] と一致する', () => {
    const article = normalizeNote(fixture(FREE));
    expect(article.embeds.map((e) => [e.key, e.service])).toEqual([
      ['emb8df5db980187', 'external-article'],
      ['embf050c2ff48cf', 'external-article'],
      ['emb084b63c7b842', 'external-article'],
      ['emb6e4a8d7c1346', 'note'],
      ['embc470b26beebe', 'note'],
      ['embec1cf1af083b', 'note'],
      ['emb3f04b3195a47', 'external-article'],
    ]);
    expect(article.embeds[3]?.url).toBe('https://note.com/kida_lw/n/n139dd4425bd8');
    expect(normalizeNote(fixture(PAID)).embeds).toEqual([]);
  });

  it('note 埋め込み（iframe）は本文に入れず、embeds の key で置き換えられる', () => {
    const article = normalizeNote(fixture(FREE));
    expect(article.bodyHtml).not.toContain('<iframe');
    const keys = [...article.bodyHtml.matchAll(/data-nbk-embed-key="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toHaveLength(7);
    const embedKeys = new Set(article.embeds.map((e) => e.key));
    for (const key of keys) expect(embedKeys.has(key as string)).toBe(true);
  });

  it('excerpt は本文のテキストの先頭 240 文字', () => {
    const article = normalizeNote(fixture(FREE));
    expect(article.excerpt.length).toBe(240);
    expect(article.excerpt).not.toMatch(/[<>]|&amp;|\s{2,}/);
    expect(article.excerpt.startsWith('この記事は約5分で読めます。 この記事はAmazon')).toBe(true);
  });

  it('見出し画像がない（空文字）なら eyecatch と eyecatchUrl は null', () => {
    const raw = fixture(FREE);
    raw.data.eyecatch = '';
    const article = normalizeNote(raw);
    expect(article.eyecatch).toBeNull();
    expect(article.eyecatchUrl).toBeNull();
  });

  it('eyecatch が null でも画像なしとして扱い、alt が null なら空文字にする', () => {
    const noImage = fixture(FREE);
    noImage.data.eyecatch = null;
    expect(normalizeNote(noImage).eyecatch).toBeNull();

    const noAlt = fixture(FREE);
    noAlt.data.eyecatch_alt = null;
    expect(normalizeNote(noAlt).eyecatch?.alt).toBe('');
  });

  it('h2・h3 以外の目次項目と、許可しない文字を含む name の項目は除く', () => {
    const raw = fixture(FREE);
    raw.data.index = [
      { body: 'a', name: 'ok-1', level: 'h2' },
      { body: 'b', name: 'ok-2', level: 'h4' },
      { body: 'c', name: 'bad id"', level: 'h3' },
    ];
    expect(normalizeNote(raw).toc).toEqual([{ id: 'nbk-ok-1', text: 'a', level: 2 }]);
  });

  it('https でない URL・許可しない文字を含む key の埋め込みは除く', () => {
    const raw = fixture(FREE);
    raw.data.embedded_contents = [
      { key: 'emb1', service: 'note', url: 'https://example.com/a' },
      { key: 'emb2', service: 'note', url: 'javascript:alert(1)' },
      { key: 'emb 3', service: 'note', url: 'https://example.com/c' },
    ];
    expect(normalizeNote(raw).embeds).toEqual([{ key: 'emb1', service: 'note', url: 'https://example.com/a' }]);
  });

  it('許可しない文字を含む service の埋め込みは除き、形式の違う urlname は NoteSchemaError', () => {
    const raw = fixture(FREE);
    raw.data.embedded_contents = [{ key: 'emb1', service: '"><x onclick=1>', url: 'https://example.com/' }];
    expect(normalizeNote(raw).embeds).toEqual([]);

    const badUser = fixture(FREE);
    (badUser.data.user as Record<string, unknown>).urlname = 'a/../b';
    expect(() => normalizeNote(badUser)).toThrow(NoteSchemaError);
  });

  it('必須のキーがない・型が違うときは NoteSchemaError', () => {
    const missing = fixture(FREE);
    delete missing.data.can_read;
    expect(() => normalizeNote(missing)).toThrow(NoteSchemaError);

    const wrongType = fixture(FREE);
    wrongType.data.note_url = 'javascript:alert(1)';
    expect(() => normalizeNote(wrongType)).toThrow(NoteSchemaError);

    expect(() => normalizeNote({})).toThrow(NoteSchemaError);
  });
});
