import { describe, expect, it } from 'vitest';
import { FREE_KEY, findArticle, loadNote, PAID_KEY } from '../react/test-fixtures.js';
import { generateNoteMetadata } from './metadata.js';

const free = loadNote(FREE_KEY);

describe('generateNoteMetadata', () => {
  it('canonical の既定値は note の元 URL', () => {
    const metadata = generateNoteMetadata(free);
    expect(metadata.alternates.canonical).toBe('https://note.com/kida_lw/n/n55256baa5425');
    expect(metadata.openGraph.url).toBe(metadata.alternates.canonical);
  });

  it('canonical を渡すと canonical と og:url を上書きする', () => {
    const metadata = generateNoteMetadata(free, { canonical: 'https://example.com/blog/n55256baa5425' });
    expect(metadata.alternates.canonical).toBe('https://example.com/blog/n55256baa5425');
    expect(metadata.openGraph.url).toBe('https://example.com/blog/n55256baa5425');
  });

  it('タイトル・説明・OG・Twitter を記事から作る', () => {
    const metadata = generateNoteMetadata(free);
    expect(metadata.title).toBe(free.title);
    expect(metadata.description).toBe(free.excerpt);
    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      title: free.title,
      description: free.excerpt,
      publishedTime: free.publishedAt,
      images: [{ url: free.eyecatch?.url, width: 1280, height: 670, alt: '見出し画像' }],
    });
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: free.title,
      description: free.excerpt,
      images: [free.eyecatch?.url],
    });
  });

  it('formatTitle でタイトルを加工する（OG・Twitter にも使う）', () => {
    const metadata = generateNoteMetadata(free, { formatTitle: (title) => `${title} | ブログ` });
    expect(metadata.title).toBe(`${free.title} | ブログ`);
    expect(metadata.openGraph.title).toBe(`${free.title} | ブログ`);
    expect(metadata.twitter.title).toBe(`${free.title} | ブログ`);
  });

  it('一覧の記事（NoteArticleSummary）からも作れる。画像は eyecatchUrl を使う', () => {
    const summary = findArticle(FREE_KEY);
    const metadata = generateNoteMetadata(summary);
    expect(metadata.alternates.canonical).toBe(summary.url);
    expect(metadata.openGraph.images).toEqual([{ url: summary.eyecatchUrl }]);
  });

  it('画像がない・https でない画像の記事は images を出さず、Twitter のカードを summary にする', () => {
    for (const article of [
      { ...free, eyecatch: null, eyecatchUrl: null },
      {
        ...free,
        eyecatch: { url: 'javascript:alert(1)', width: 1, height: 1, alt: '' },
        eyecatchUrl: 'http://x/a.png',
      },
    ]) {
      const metadata = generateNoteMetadata(article);
      expect(metadata.openGraph.images).toBeUndefined();
      expect(metadata.twitter.images).toBeUndefined();
      expect(metadata.twitter.card).toBe('summary');
    }
  });

  it('canonical を渡さず、記事 URL が https でなければ TypeError', () => {
    expect(() => generateNoteMetadata({ ...free, url: 'javascript:alert(1)' })).toThrow(TypeError);
    expect(
      generateNoteMetadata({ ...free, url: 'javascript:alert(1)' }, { canonical: 'https://example.com/a' }).alternates
        .canonical,
    ).toBe('https://example.com/a');
  });

  it('有料記事でも作れる', () => {
    const paid = loadNote(PAID_KEY);
    expect(generateNoteMetadata(paid).alternates.canonical).toBe(paid.url);
  });
});
