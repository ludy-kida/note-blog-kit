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
  /** 本文先頭のプレーンテキスト。`<` などがそのまま入りうるので、HTML として挿入しないこと */
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
  /** 見出しのプレーンテキスト。HTML として挿入しないこと */
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
  /** 実際の取得元（`source: 'auto'` で RSS に切り替わったページは `'rss'`） */
  source: NoteSource;
}

/**
 * note からの取得の失敗を表す安定した識別子。`note-blog-kit/server` のエラーの `code` と、
 * 中継エンドポイントの応答の `error` に使う（`note-blog-kit/server` からも同じ型を export する）。
 *
 * マイナーバージョンでコードが増えることがある。
 * `switch (error.code)` で分けるときは、知らないコードのために `default` を書くこと。
 */
export type NoteErrorCode =
  | 'NOTE_NOT_FOUND'
  | 'NOTE_HTTP_ERROR'
  | 'NOTE_RATE_LIMITED'
  | 'NOTE_NETWORK_ERROR'
  | 'NOTE_TIMEOUT'
  | 'NOTE_SCHEMA_ERROR';

/**
 * CLI `note-blog-kit sync` が書き出す `<out>/articles.json` の形（形式のバージョン 1）。
 * 記事1件ごとの `<out>/articles/<key>.json` は {@link NoteArticle} そのもの。
 *
 * `version` を上げるのは、既存の項目の意味・型を変える、または項目を消すときだけ。
 * 項目を足すだけなら `version` は 1 のままにし、読み手は知らない項目を無視する。
 * `useNoteArticles` は知らない `version` をエラーにする。v0.3 までの `articles.json` には `version` がない。
 */
export interface NoteSyncedArticleList {
  /** 形式のバージョン */
  version: 1;
  /** 書き出したユーザー名（`--user`） */
  user: string;
  /** 書き出した日時（ISO 8601） */
  syncedAt: string;
  /** `--max-pages` で一覧の取得を打ち切ったとき true */
  truncated: boolean;
  /** 記事の一覧（新しい順） */
  articles: NoteArticleSummary[];
}

/**
 * 中継エンドポイント（`note-blog-kit/next` の `createNoteArticlesHandler`）が返すエラーコード。
 * `INVALID_REQUEST`（page・クエリが不正）、`INTERNAL_ERROR`（想定外の失敗）と、note からの取得の {@link NoteErrorCode}。
 *
 * {@link NoteErrorCode} と同じく、マイナーバージョンでコードが増えることがある。`switch` には `default` を書くこと。
 */
export type NoteArticlesHandlerErrorCode = 'INVALID_REQUEST' | 'INTERNAL_ERROR' | NoteErrorCode;

/** 中継エンドポイントが失敗したときに返す JSON の本文 */
export interface NoteArticlesHandlerErrorBody {
  /** エラーコード */
  error: NoteArticlesHandlerErrorCode;
}
