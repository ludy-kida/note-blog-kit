import type { ReactElement, ReactNode } from 'react';
import type { NoteArticleSummary } from '../core/types.js';
import { classNames } from './class-names.js';
import { NoteArticleCard, type NoteArticleCardProps } from './NoteArticleCard.js';
import type { NoteHeadingLevel, NoteLinkComponent } from './types.js';

/** {@link NoteArticleList} の props */
export interface NoteArticleListProps {
  /** 表示する記事の一覧（`listArticles` の `articles` など） */
  articles: readonly NoteArticleSummary[];
  /**
   * 各記事のリンク先。既定は `article.url`（note の記事 URL）。
   * 戻り値はそのまま `href` に入るため、信頼できない値（`javascript:` など）を返さないこと。
   */
  getHref?: (article: NoteArticleSummary) => string;
  /** リンクに使う要素。既定は `'a'` */
  linkComponent?: NoteLinkComponent;
  /** 日付の表示。既定は Asia/Tokyo の `YYYY/MM/DD` */
  formatDate?: (iso: string) => string;
  /** 各カードのタイトルの見出しレベル。既定は 2 */
  headingLevel?: NoteHeadingLevel;
  /** 各記事の描画を丸ごと差し替える。既定は {@link NoteArticleCard} */
  renderItem?: (article: NoteArticleSummary) => ReactNode;
  /** 記事が0件のときの表示。既定は「記事がありません」 */
  empty?: ReactNode;
  /** 既定のクラス名（`nbk-article-list`）に追加するクラス名。0件のときも同じ要素に付く */
  className?: string;
}

/**
 * 記事の一覧。見た目は持たず、`nbk-article-list` から始まるクラス名を付ける。
 * 記事があれば `ul.nbk-article-list`、0件なら `div.nbk-article-list.nbk-article-list--empty` を出す。
 * フックを使わないため、Server Component としても使える。
 */
export function NoteArticleList({
  articles,
  getHref,
  linkComponent,
  formatDate,
  headingLevel,
  renderItem,
  empty = '記事がありません',
  className,
}: NoteArticleListProps): ReactElement {
  if (articles.length === 0) {
    return (
      <div className={classNames('nbk-article-list', 'nbk-article-list--empty', className)}>
        <p className="nbk-article-list__empty">{empty}</p>
      </div>
    );
  }
  const cardProps: Omit<NoteArticleCardProps, 'article' | 'href'> = {
    ...(linkComponent !== undefined && { linkComponent }),
    ...(formatDate !== undefined && { formatDate }),
    ...(headingLevel !== undefined && { headingLevel }),
  };
  return (
    <ul className={classNames('nbk-article-list', className)}>
      {articles.map((article) => (
        <li key={article.key} className="nbk-article-list__item">
          {renderItem !== undefined ? (
            renderItem(article)
          ) : (
            <NoteArticleCard
              article={article}
              {...(getHref !== undefined && { href: getHref(article) })}
              {...cardProps}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
