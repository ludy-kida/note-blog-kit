import type { ReactElement, ReactNode } from 'react';
import { classNames } from './class-names.js';
import type { NoteLinkComponent } from './types.js';

/** {@link NotePagination} の props */
export interface NotePaginationProps {
  /** 現在のページ（1 始まり） */
  page: number;
  /** 最終ページかどうか（`listArticles` の戻り値の `isLastPage`） */
  isLastPage: boolean;
  /** 総件数。分かれば「3 / 40」のように総ページ数も表示する。RSS では null */
  totalCount?: number | null;
  /** 1ページの件数。総ページ数の計算に使う。既定は 6（note の一覧 API の件数） */
  perPage?: number;
  /**
   * ページ番号からリンク先を作る。
   * 戻り値はそのまま `href` に入るため、信頼できない値（`javascript:` など）を返さないこと。
   */
  getHref: (page: number) => string;
  /** リンクに使う要素。既定は `'a'` */
  linkComponent?: NoteLinkComponent;
  /** 文言の差し替え。既定は「前へ」「次へ」 */
  labels?: { previous?: ReactNode; next?: ReactNode };
  /** 既定のクラス名（`nbk-pagination`）に追加するクラス名 */
  className?: string;
}

const NOTE_PER_PAGE = 6;

/**
 * 前後のページへのリンク。見た目は持たず、`nbk-pagination` から始まるクラス名を付ける。
 * フックを使わないため、Server Component としても使える。
 */
export function NotePagination({
  page,
  isLastPage,
  totalCount = null,
  perPage = NOTE_PER_PAGE,
  getHref,
  linkComponent: Link = 'a',
  labels,
  className,
}: NotePaginationProps): ReactElement {
  const totalPages = totalCount !== null && perPage > 0 ? Math.max(1, Math.ceil(totalCount / perPage)) : null;
  return (
    <nav className={classNames('nbk-pagination', className)} aria-label="ページ送り">
      {page > 1 && (
        <Link href={getHref(page - 1)} className="nbk-pagination__prev">
          {labels?.previous ?? '前へ'}
        </Link>
      )}
      <span className="nbk-pagination__status" aria-current="page">
        {totalPages === null ? `${page}` : `${page} / ${totalPages}`}
      </span>
      {!isLastPage && (
        <Link href={getHref(page + 1)} className="nbk-pagination__next">
          {labels?.next ?? '次へ'}
        </Link>
      )}
    </nav>
  );
}
