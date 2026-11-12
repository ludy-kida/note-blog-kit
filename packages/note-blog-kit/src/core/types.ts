/**
 * 公開型。note の生 JSON は公開せず、すべてこの型に正規化する。
 * 確定の経緯は docs/phase0-findings.md を参照。変更は人の承認が必要。
 */

/** 取得元 */
export type NoteSource = 'api' | 'rss';

/** 記事の著者 */
export interface NoteAuthor {
  /** 表示名 */
  name: string;
  /** note.com/{urlname} の部分 */
  urlname: string;
  imageUrl: string | null;
}

/** 一覧に出す記事。API（v2 contents）と RSS のどちらからも作れる */
export interface NoteArticleSummary {
  /** 記事キー（例: n55256baa5425） */
  key: string;
  title: string;
  /** note 上の記事 URL。canonical の既定値 */
  url: string;
  /** ISO 8601 */
  publishedAt: string;
  /** 本文先頭のプレーンテキスト */
  excerpt: string;
  eyecatchUrl: string | null;
  /** 先頭の # を除いたハッシュタグ。RSS では常に空 */
  hashtags: string[];
  /** RSS では null */
  likeCount: number | null;
  /** 価格（円）。0 は無料。RSS では null */
  price: number | null;
  author: NoteAuthor;
  source: NoteSource;
}

/** 見出し画像 */
export interface NoteEyecatch {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
}

/** 目次の項目 */
export interface NoteTocItem {
  /** 本文中の見出しの id */
  id: string;
  text: string;
  level: 2 | 3;
}

/** 本文中の埋め込み */
export interface NoteEmbed {
  key: string;
  service: 'note' | 'external-article' | (string & {});
  url: string;
}

/** 詳細ページの記事（v3 notes から作る） */
export interface NoteArticle extends NoteArticleSummary {
  /** サニタイズ済みの本文 HTML */
  bodyHtml: string;
  /** 有料部分があり、本文が途中までのとき true（「続きは note で」を出す） */
  isPartial: boolean;
  eyecatch: NoteEyecatch | null;
  toc: NoteTocItem[];
  embeds: NoteEmbed[];
}

/** 記事一覧の1ページ */
export interface NoteArticlePage {
  articles: NoteArticleSummary[];
  page: number;
  /** RSS では null */
  totalCount: number | null;
  isLastPage: boolean;
}
