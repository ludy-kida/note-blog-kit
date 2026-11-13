import type { ReactElement } from 'react';
import type { NoteArticleSummary } from '../core/types.js';
import { classNames } from './class-names.js';
import { formatNoteDate } from './format-date.js';
import type { NoteLinkComponent } from './types.js';

/** {@link NoteArticleCard} の props */
export interface NoteArticleCardProps {
  article: NoteArticleSummary;
  /**
   * リンク先。既定は `article.url`（note の記事 URL）。
   * 利用者が渡す値はそのまま `href` に入るため、信頼できない値（`javascript:` など）を渡さないこと。
   */
  href?: string;
  /** リンクに使う要素。既定は `'a'` */
  linkComponent?: NoteLinkComponent;
  /** 日付の表示。既定は Asia/Tokyo の `YYYY/MM/DD` */
  formatDate?: (iso: string) => string;
  /** 既定のクラス名（`nbk-card`）に追加するクラス名 */
  className?: string;
}

/**
 * 記事1件のカード。見た目は持たず、`nbk-card` から始まるクラス名を付ける。
 * フックを使わないため、Server Component としても使える。
 */
export function NoteArticleCard({
  article,
  href = article.url,
  linkComponent: Link = 'a',
  formatDate = formatNoteDate,
  className,
}: NoteArticleCardProps): ReactElement {
  return (
    <article className={classNames('nbk-card', className)}>
      {article.eyecatchUrl !== null && (
        <img className="nbk-card__eyecatch" src={article.eyecatchUrl} alt="" loading="lazy" decoding="async" />
      )}
      <h2 className="nbk-card__title">
        <Link href={href} className="nbk-card__link">
          {article.title}
        </Link>
      </h2>
      <time className="nbk-card__date" dateTime={article.publishedAt}>
        {formatDate(article.publishedAt)}
      </time>
      {article.price !== null && article.price > 0 && <span className="nbk-card__badge">有料</span>}
      {article.excerpt !== '' && <p className="nbk-card__excerpt">{article.excerpt}</p>}
      {article.hashtags.length > 0 && (
        <ul className="nbk-card__tags">
          {article.hashtags.map((tag) => (
            <li key={tag} className="nbk-card__tag">
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
