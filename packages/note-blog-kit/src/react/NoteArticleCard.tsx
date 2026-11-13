import type { ReactElement, ReactNode } from 'react';
import type { NoteArticleSummary } from '../core/types.js';
import { classNames } from './class-names.js';
import { formatNoteDate } from './format-date.js';
import { safeHttpUrl } from './safe-url.js';
import type { NoteHeadingLevel, NoteLinkComponent } from './types.js';

/** {@link NoteArticleCard} の props */
export interface NoteArticleCardProps {
  /** 表示する記事（`listArticles` などで取得したもの） */
  article: NoteArticleSummary;
  /**
   * リンク先。既定は `article.url`（note の記事 URL。http(s) でなければリンクにしない）。
   * 利用者が渡す値はそのまま `href` に入るため、信頼できない値（`javascript:` など）を渡さないこと。
   * React 18 はこうした値をブロックしない。
   */
  href?: string;
  /** リンクに使う要素。既定は `'a'` */
  linkComponent?: NoteLinkComponent;
  /** 日付の表示。既定は Asia/Tokyo の `YYYY/MM/DD` */
  formatDate?: (iso: string) => string;
  /** タイトルの見出しレベル。既定は 2（`h2`）。一覧を `h2` の節の中に置くなら 3 にする */
  headingLevel?: NoteHeadingLevel;
  /** 文言の差し替え。既定は「有料」 */
  labels?: { paid?: ReactNode };
  /** 既定のクラス名（`nbk-card`）に追加するクラス名 */
  className?: string;
}

/**
 * 記事1件のカード。見た目は持たず、`nbk-card` から始まるクラス名を付ける。
 * フックを使わないため、Server Component としても使える。
 */
export function NoteArticleCard({
  article,
  href,
  linkComponent: Link = 'a',
  formatDate = formatNoteDate,
  headingLevel = 2,
  labels,
  className,
}: NoteArticleCardProps): ReactElement {
  const Heading = `h${headingLevel}` as const;
  const linkHref = href ?? safeHttpUrl(article.url);
  const eyecatchUrl = safeHttpUrl(article.eyecatchUrl);
  return (
    <article className={classNames('nbk-card', className)}>
      {eyecatchUrl !== null && (
        <img className="nbk-card__eyecatch" src={eyecatchUrl} alt="" loading="lazy" decoding="async" />
      )}
      <Heading className="nbk-card__title">
        {linkHref === null ? (
          article.title
        ) : (
          <Link href={linkHref} className="nbk-card__link">
            {article.title}
          </Link>
        )}
      </Heading>
      <time className="nbk-card__date" dateTime={article.publishedAt}>
        {formatDate(article.publishedAt)}
      </time>
      {article.price !== null && article.price > 0 && <span className="nbk-card__badge">{labels?.paid ?? '有料'}</span>}
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
