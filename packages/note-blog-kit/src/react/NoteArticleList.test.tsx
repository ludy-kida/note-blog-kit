// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoteArticleList } from './NoteArticleList.js';
import { loadArticles } from './test-fixtures.js';

afterEach(cleanup);

describe('NoteArticleList', () => {
  it('記事の数だけカードを並べる', () => {
    const articles = loadArticles(1);
    const { container } = render(<NoteArticleList articles={articles} />);
    const list = container.querySelector('ul.nbk-article-list');
    expect(list).not.toBeNull();
    const items = container.querySelectorAll('ul.nbk-article-list > li.nbk-article-list__item');
    expect(items).toHaveLength(articles.length);
    expect(items[0]?.querySelector('article.nbk-card')).not.toBeNull();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      articles.map((article) => article.url),
    );
  });

  it('getHref で各記事のリンク先を差し替えられる', () => {
    const articles = loadArticles(1);
    render(<NoteArticleList articles={articles} getHref={(article) => `/blog/${article.key}`} />);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      articles.map((article) => `/blog/${article.key}`),
    );
  });

  it('renderItem で各記事の描画を丸ごと差し替えられる', () => {
    const articles = loadArticles(1);
    const { container } = render(
      <NoteArticleList articles={articles} renderItem={(article) => <span className="mine">{article.key}</span>} />,
    );
    expect(container.querySelector('.nbk-card')).toBeNull();
    expect([...container.querySelectorAll('li > span.mine')].map((el) => el.textContent)).toEqual(
      articles.map((article) => article.key),
    );
  });

  it('className を既定のクラスに追加する', () => {
    const { container } = render(<NoteArticleList articles={loadArticles(1)} className="my-list" />);
    expect(container.querySelector('ul')?.className).toBe('nbk-article-list my-list');
  });

  it('0件のときは empty を表示する（既定は「記事がありません」）。className は外側の要素に付く', () => {
    const { container, rerender } = render(<NoteArticleList articles={[]} className="my-list" />);
    expect(container.querySelector('ul')).toBeNull();
    const root = container.querySelector('div.nbk-article-list.nbk-article-list--empty');
    expect(root?.className).toBe('nbk-article-list nbk-article-list--empty my-list');
    expect(root?.querySelector('p.nbk-article-list__empty')?.textContent).toBe('記事がありません');
    rerender(<NoteArticleList articles={[]} empty="まだ記事がありません" />);
    expect(container.querySelector('p.nbk-article-list__empty')?.textContent).toBe('まだ記事がありません');
  });

  it('headingLevel を各カードに渡す', () => {
    const { container } = render(<NoteArticleList articles={loadArticles(1)} headingLevel={3} />);
    expect(container.querySelectorAll('h3.nbk-card__title')).toHaveLength(6);
    expect(container.querySelector('h2')).toBeNull();
  });
});
