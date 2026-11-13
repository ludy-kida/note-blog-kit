// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotePagination } from './NotePagination.js';

afterEach(cleanup);

const getHref = (page: number) => `/blog?page=${page}`;

describe('NotePagination', () => {
  it('前後のページへのリンクと現在のページを表示する', () => {
    const { container } = render(<NotePagination page={3} isLastPage={false} totalCount={237} getHref={getHref} />);
    const nav = screen.getByRole('navigation', { name: 'ページ送り' });
    expect(nav.className).toBe('nbk-pagination');
    const prev = container.querySelector('a.nbk-pagination__prev');
    const next = container.querySelector('a.nbk-pagination__next');
    expect(prev?.getAttribute('href')).toBe('/blog?page=2');
    expect(prev?.textContent).toBe('前へ');
    expect(next?.getAttribute('href')).toBe('/blog?page=4');
    expect(next?.textContent).toBe('次へ');
    const status = container.querySelector('span.nbk-pagination__status');
    expect(status?.textContent).toBe('3 / 40');
    expect(status?.getAttribute('aria-current')).toBe('page');
  });

  it('1ページ目には「前へ」を、最終ページには「次へ」を出さない', () => {
    const { container, rerender } = render(<NotePagination page={1} isLastPage={false} getHref={getHref} />);
    expect(container.querySelector('.nbk-pagination__prev')).toBeNull();
    expect(container.querySelector('.nbk-pagination__next')).not.toBeNull();
    rerender(<NotePagination page={40} isLastPage={true} getHref={getHref} />);
    expect(container.querySelector('.nbk-pagination__prev')).not.toBeNull();
    expect(container.querySelector('.nbk-pagination__next')).toBeNull();
  });

  it('totalCount が無ければ現在のページ番号だけを出す', () => {
    const { container } = render(<NotePagination page={2} isLastPage={false} totalCount={null} getHref={getHref} />);
    expect(container.querySelector('.nbk-pagination__status')?.textContent).toBe('2');
  });

  it('perPage で総ページ数の計算を変えられる', () => {
    const { container } = render(
      <NotePagination page={1} isLastPage={false} totalCount={25} perPage={10} getHref={getHref} />,
    );
    expect(container.querySelector('.nbk-pagination__status')?.textContent).toBe('1 / 3');
  });

  it('labels・className で差し替えられる', () => {
    const { container } = render(
      <NotePagination
        page={2}
        isLastPage={false}
        getHref={getHref}
        labels={{ previous: '← 新しい記事', next: '古い記事 →' }}
        className="my-pager"
      />,
    );
    expect(container.querySelector('nav')?.className).toBe('nbk-pagination my-pager');
    expect(container.querySelector('.nbk-pagination__prev')?.textContent).toBe('← 新しい記事');
    expect(container.querySelector('.nbk-pagination__next')?.textContent).toBe('古い記事 →');
  });
});
