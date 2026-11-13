// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoteArticleCard } from './NoteArticleCard.js';
import { FREE_KEY, findArticle, PAID_KEY } from './test-fixtures.js';

afterEach(cleanup);

/** linkComponent に渡された props を記録する独自のリンク */
const received: { href: string; className?: string }[] = [];
function MyLink({ href, className, children }: { href: string; className?: string; children?: ReactNode }) {
  received.push({ href, ...(className === undefined ? {} : { className }) });
  return (
    <a href={href} className={className} data-custom="1">
      {children}
    </a>
  );
}

describe('NoteArticleCard', () => {
  it('タイトル・リンク・日付・抜粋・ハッシュタグ・見出し画像を表示する', () => {
    const article = findArticle(FREE_KEY);
    const { container } = render(<NoteArticleCard article={article} />);

    const root = container.querySelector('article.nbk-card');
    expect(root).not.toBeNull();

    const link = screen.getByRole('link', { name: article.title });
    expect(link.getAttribute('href')).toBe(article.url);
    expect(link.className).toBe('nbk-card__link');
    expect(link.closest('h2')?.className).toBe('nbk-card__title');

    const time = container.querySelector('time.nbk-card__date');
    expect(time?.getAttribute('dateTime')).toBe(article.publishedAt);
    // 2026-11-12T00:38:42Z は Asia/Tokyo で 2026/11/12
    expect(time?.textContent).toBe('2026/11/12');

    expect(container.querySelector('p.nbk-card__excerpt')?.textContent).toBe(article.excerpt);

    const tags = container.querySelectorAll('ul.nbk-card__tags > li.nbk-card__tag');
    expect([...tags].map((tag) => tag.textContent)).toEqual(article.hashtags.map((tag) => `#${tag}`));

    const image = container.querySelector('img.nbk-card__eyecatch');
    expect(image?.getAttribute('src')).toBe(article.eyecatchUrl);
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('loading')).toBe('lazy');

    expect(container.querySelector('.nbk-card__badge')).toBeNull();
  });

  it('有料記事に「有料」バッジを出す（labels.paid で差し替えられる）', () => {
    const { container, rerender } = render(<NoteArticleCard article={findArticle(PAID_KEY)} />);
    expect(container.querySelector('span.nbk-card__badge')?.textContent).toBe('有料');
    rerender(<NoteArticleCard article={findArticle(PAID_KEY)} labels={{ paid: 'Paid' }} />);
    expect(container.querySelector('span.nbk-card__badge')?.textContent).toBe('Paid');
  });

  it('headingLevel で見出しレベルを変えられる（既定は h2）', () => {
    const { container } = render(<NoteArticleCard article={findArticle(FREE_KEY)} headingLevel={3} />);
    expect(container.querySelector('h3.nbk-card__title')).not.toBeNull();
    expect(container.querySelector('h2')).toBeNull();
  });

  it('既定の記事 URL・画像 URL が http(s) でなければ、リンク・画像にしない', () => {
    for (const unsafe of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:x']) {
      const article = { ...findArticle(FREE_KEY), url: unsafe, eyecatchUrl: unsafe };
      const { container, unmount } = render(<NoteArticleCard article={article} />);
      expect(container.querySelector('a'), unsafe).toBeNull();
      expect(container.querySelector('img'), unsafe).toBeNull();
      expect(container.querySelector('.nbk-card__title')?.textContent).toBe(article.title);
      unmount();
    }
  });

  it('日時として解釈できない値は、そのまま表示する（描画を失敗させない）', () => {
    const article = { ...findArticle(FREE_KEY), publishedAt: 'not-a-date' };
    const { container } = render(<NoteArticleCard article={article} />);
    expect(container.querySelector('time')?.textContent).toBe('not-a-date');
  });

  it('値の無い項目は要素ごと出さない', () => {
    const article = { ...findArticle(FREE_KEY), eyecatchUrl: null, excerpt: '', hashtags: [], price: null };
    const { container } = render(<NoteArticleCard article={article} />);
    expect(container.querySelector('.nbk-card__eyecatch')).toBeNull();
    expect(container.querySelector('.nbk-card__excerpt')).toBeNull();
    expect(container.querySelector('.nbk-card__tags')).toBeNull();
    expect(container.querySelector('.nbk-card__badge')).toBeNull();
  });

  it('href・linkComponent・formatDate・className で差し替えられる', () => {
    const article = findArticle(FREE_KEY);
    received.length = 0;
    const { container } = render(
      <NoteArticleCard
        article={article}
        href="/blog/n55256baa5425"
        linkComponent={MyLink}
        formatDate={(iso) => `date:${iso.slice(0, 4)}`}
        className="my-card"
      />,
    );
    expect(received).toEqual([{ href: '/blog/n55256baa5425', className: 'nbk-card__link' }]);
    const root = container.querySelector('article');
    expect(root?.className).toBe('nbk-card my-card');
    expect(
      within(root as HTMLElement)
        .getByRole('link')
        .getAttribute('data-custom'),
    ).toBe('1');
    expect(container.querySelector('time')?.textContent).toBe('date:2026');
  });
});
