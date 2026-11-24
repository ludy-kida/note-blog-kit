import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NoteSchemaError } from '../errors.js';
import { normalizeRss } from './rss.js';

const feed = readFileSync(new URL('../../../../../fixtures/rss/feed.xml', import.meta.url), 'utf8');

/** 1件目の item を書き換えた feed */
function editFirstItem(edit: (item: string) => string): string {
  const start = feed.indexOf('<item>');
  const end = feed.indexOf('</item>', start) + '</item>'.length;
  return feed.slice(0, start) + edit(feed.slice(start, end)) + feed.slice(end);
}

describe('normalizeRss', () => {
  it('fixture の25件を NoteArticleSummary にする（取れない項目は null・空）', () => {
    const page = normalizeRss(feed, 'kida_lw');
    expect(page).toMatchObject({ page: 1, totalCount: null, isLastPage: true });
    expect(page.articles).toHaveLength(25);
    for (const article of page.articles) {
      expect(article.source).toBe('rss');
      expect(article.hashtags).toEqual([]);
      expect(article.likeCount).toBeNull();
      expect(article.price).toBeNull();
      expect(article.key).toMatch(/^n[0-9a-z]+$/);
      expect(article.url).toBe(`https://note.com/kida_lw/n/${article.key}`);
      expect(article.author.urlname).toBe('kida_lw');
    }
    expect(new Set(page.articles.map((a) => a.key)).size).toBe(25);
  });

  it('1件目の値が RSS と一致する', () => {
    const [first] = normalizeRss(feed, 'kida_lw').articles;
    expect(first).toMatchObject({
      key: 'n55256baa5425',
      title: 'ノンアルコールワインをクリスマスに。乾杯用スパークリング3選',
      url: 'https://note.com/kida_lw/n/n55256baa5425',
      publishedAt: '2026-11-12T00:38:42.000Z',
      author: { name: '木田貴之', urlname: 'kida_lw' },
    });
    expect(first?.eyecatchUrl).toMatch(/^https:\/\/assets\.st-note\.com\/.+width=800$/);
    // XML の実体参照（&amp;）を戻した URL
    expect(first?.author.imageUrl).toMatch(
      /^https:\/\/assets\.st-note\.com\/.+\?fit=bounds&format=jpeg&quality=85&width=330$/,
    );
  });

  it('サムネイルのない item は eyecatchUrl: null', () => {
    const article = normalizeRss(feed, 'kida_lw').articles.find((a) => a.key === 'n30206c9b01b5');
    expect(article?.eyecatchUrl).toBeNull();
  });

  it('excerpt は本文の HTML からタグと「続きをみる」を除いたテキスト（240文字まで）', () => {
    const { articles } = normalizeRss(feed, 'kida_lw');
    expect(articles[0]?.excerpt.startsWith('この記事は約5分で読めます。')).toBe(true);
    for (const article of articles) {
      expect(article.excerpt).not.toMatch(/[<>]|続きをみる|&amp;|\s{2,}/);
      expect(Array.from(article.excerpt).length).toBeLessThanOrEqual(240);
    }
  });

  it('CDATA でない要素の実体参照を戻す', () => {
    const xml = editFirstItem((item) =>
      item.replace(/<title>[^<]*<\/title>/, '<title>A &amp; B &lt;C&gt; &#x3042;&#12354;</title>'),
    );
    expect(normalizeRss(xml, 'kida_lw').articles[0]?.title).toBe('A & B <C> ああ');
  });

  it('note の記事 URL でない・別ユーザーの記事の link は NoteSchemaError', () => {
    for (const link of [
      'https://example.com/kida_lw/n/n55256baa5425',
      'http://note.com/kida_lw/n/n55256baa5425',
      'https://note.com/someone_else/n/n55256baa5425',
      'https://note.com/kida_lw/n/../admin',
      'javascript:alert(1)',
    ]) {
      const xml = editFirstItem((item) => item.replace(/<link>[^<]*<\/link>/, `<link>${link}</link>`));
      expect(() => normalizeRss(xml, 'kida_lw'), link).toThrow(NoteSchemaError);
    }
  });

  it('必須の要素がない・日付が読めないときは NoteSchemaError', () => {
    for (const edit of [
      (item: string) => item.replace(/<link>[^<]*<\/link>/, ''),
      (item: string) => item.replace(/<title>[^<]*<\/title>/, ''),
      (item: string) => item.replace(/<pubDate>[^<]*<\/pubDate>/, '<pubDate>not a date</pubDate>'),
    ]) {
      expect(() => normalizeRss(editFirstItem(edit), 'kida_lw')).toThrow(NoteSchemaError);
    }
  });

  it('https でない画像 URL は NoteSchemaError（javascript: などを描画側に渡さない）', () => {
    const xml = editFirstItem((item) =>
      item.replace(
        /<media:thumbnail>[^<]*<\/media:thumbnail>/,
        '<media:thumbnail>javascript:alert(1)</media:thumbnail>',
      ),
    );
    expect(() => normalizeRss(xml, 'kida_lw')).toThrow(NoteSchemaError);
  });

  it('RSS でないレスポンス・item のない RSS は NoteSchemaError', () => {
    expect(() => normalizeRss('<html>maintenance</html>', 'kida_lw')).toThrow(NoteSchemaError);
    expect(() => normalizeRss('{"data":{}}', 'kida_lw')).toThrow(NoteSchemaError);
  });

  it('記事が0件の RSS（channel はあるが item がない）は空の一覧', () => {
    const empty = feed.slice(0, feed.indexOf('<item>')) + feed.slice(feed.lastIndexOf('</item>') + '</item>'.length);
    expect(normalizeRss(empty, 'kida_lw').articles).toEqual([]);
  });

  it('閉じていない item が大量にあっても、入力長にほぼ比例する時間で終わる', () => {
    const start = performance.now();
    expect(() => normalizeRss(`<rss><channel>${'<item><title>'.repeat(50000)}`, 'kida_lw')).toThrow(NoteSchemaError);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
