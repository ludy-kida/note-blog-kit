# Phase 0 調査結果と公開型の案

2026-11-12 に `kida_lw` の公開記事から取得した fixture（`fixtures/`）の分析。

## 0. 決定事項（2026-11-12、人が確定）

| 項目 | 決定 |
| --- | --- |
| 公開型 | 「5. 公開型の案」のとおり確定（RSS で取れない項目は `null`） |
| パッケージ名 | `note-blog-kit` |
| 全件取得の上限 | 既定で上限を設け、引数（`maxPages`）で変更できるようにする。既定値は Phase 2 の計画で提案する |
| 本文のスタイル | 任意のデフォルト CSS は note の見た目に合わせる。利用者のカスタム CSS で上書き・装飾できるようにする |
| 利用規約・robots.txt | 未確認（人の作業として残っている） |

## 1. エンドポイントの生死と CORS

| エンドポイント | 結果 | Content-Type | `Access-Control-Allow-Origin` |
| --- | --- | --- | --- |
| `GET /api/v2/creators/{user}/contents?kind=note&page=N` | 200（3ページ） | `application/json` | なし |
| `GET /api/v3/notes/{key}`（無料・有料） | 200 | `application/json` | なし |
| `GET /{user}/rss` | 200 | `application/xml` | なし |

- 3種類とも生きている。計画どおり API 主体＋RSS フォールバックで進められる（RSS 主体への切り替えは不要）。
- いずれも CORS ヘッダーがなく、ブラウザから直接は読めない。「取得はすべてサーバー側」という前提が確認できた。
- 存在しないユーザーでは、contents が 404 `{"data":"リソースが見つかりません"}`、RSS が本文なしの 404 を返す。型付きエラー（`NoteNotFoundError` など）の根拠にできる。

## 2. 記事一覧（v2 contents）

- 形：`{ data: { contents: [...], isLastPage: boolean, totalCount: number } }`。キーは **camelCase**
- **1ページ6件で固定**（指定パラメータなし）。`totalCount` は 237 件
  → 全件取得（`iterateArticles`）は約40リクエストになる。1秒間隔だと約40秒かかるため、全件取得はビルド時（CLI `sync`・`generateStaticParams`）とキャッシュ前提で使う、とドキュメントに書く必要がある
- 表示に使えるキー（実在を確認）：`key`, `name`, `noteUrl`, `publishAt`（`2026-11-12T09:38:42+09:00`）, `eyecatch`, `spEyecatch`（正方形）, `body`, `hashtags[].hashtag.name`（`#` 付き）, `likeCount`, `commentCount`, `price`, `priceInfo.isFree`, `canRead`, `isPinned`, `user.nickname`, `user.urlname`, `user.userProfileImagePath`
- `body` は**本文の先頭240文字のプレーンテキスト**（抜粋に使える）。有料記事では `"\n"` のみ
- `description` は全件 `null`、`thumbnailExternalUrl` は空文字。どちらも使わない
- 1件のレスポンスに約60キーある。ほとんどは編集・購入・共有用で、ライブラリには不要

## 3. 記事本文（v3 notes）

- 形：`{ data: {...} }`。キーは **snake_case**（v2 と揃っていない）。日時はミリ秒付き（`2026-11-12T09:38:42.000+09:00`）
- 表示に使えるキー：`key`, `name`, `body`（HTML）, `note_url`, `publish_at`, `eyecatch`, `eyecatch_alt`, `eyecatch_width`, `eyecatch_height`, `hashtag_notes[].hashtag.name`, `like_count`, `price`, `can_read`, `separator`, `embedded_contents[]`, `index[]`（目次：`{ body, name, level: 'h2'|'h3' }`）, `user.nickname`, `user.urlname`, `user.user_profile_image_path`
- **有料記事**（980円）：`can_read: false`、`body` は無料部分だけ（この記事では目次のみの129文字）。有料部分は返ってこないので、「続きは note で」を出す判定は `can_read === false` でよい
- `description` は空文字

### 本文 HTML の特徴（サニタイズの許可リストを決める材料）

- 使われていたタグ：`p`, `br`, `h2`, `h3`, `strong`, `em`, `a`, `ul`, `ol`, `li`, `blockquote`, `figure`, `figcaption`, `img`, `table-of-contents`（独自要素、中身は `<br>` だけ）
- ほぼすべてのブロックに `name` と `id`（UUID）が付く。目次（`index[].name`）からのリンク先になる
- 画像：`<figure><img src="https://assets.st-note.com/img/..." width height alt></figure>`
- 埋め込み：`<figure embedded-service="..." embedded-content-key="emb..." data-src="元URL" data-identifier>`
  - `external-article`（Amazon など）：figure の中にリンクカードの HTML がそのまま入っている（`rel="nofollow noopener" target="_blank"`）。**アフィリエイトのリンク（`tag=` パラメータ）を含む**ため、サニタイズで href を壊さないこと
  - `note`（自分の他記事）：body の figure は空。`embedded_contents[]` の `html_for_embed` に `note.com/embed/notes/{key}` の iframe がある → iframe は通さず、`components` で記事カードに置き換える設計がよい
- `embedded_contents[]` のキー：`key`, `url`, `service`, `identifier`, `embeddable_type`, `html_for_display`, `html_for_embed`, `caption`, `created_at`, `is_custom_domain`

## 4. RSS

- 最新25件。`title`, `link`, `guid`, `pubDate`（RFC 822）, `media:thumbnail`, `note:creatorName`, `note:creatorImage`, `description`
- `description` は本文先頭の HTML を途中で切ったものに「続きをみる」リンクを足したもの。抜粋はタグを除いて作る
- **ハッシュタグ・価格・スキ数・記事キーは含まれない**（キーは `link` 末尾 `/n/{key}` から取れる）
- チャンネルの `description` はプロフィール文（メールアドレスは保存時に伏せた）

## 5. 公開型の案

note の生 JSON は公開せず、次の自前の型に正規化する。RSS では取れない項目は `null` にして、取れないことを型で示す。

ここで確定するのは記事データの型だけ。取得関数のオプション・結果・エラーの型（`ListArticlesOptions`・`IterateArticlesResult`・`NoteError` など）は `etc/*.api.md` を正とし、PR ごとに人が確認する。

```ts
/** 一覧に出す記事（v2 contents と RSS の両方から作れる） */
export interface NoteArticleSummary {
  key: string;                 // v2 key / RSS link 末尾
  title: string;               // v2 name / RSS title
  url: string;                 // v2 noteUrl / RSS link（canonical の既定値）
  publishedAt: string;         // ISO 8601。v2 publishAt / RSS pubDate を変換
  excerpt: string;             // v2 body / RSS description のタグを除いたもの
  eyecatchUrl: string | null;  // v2 eyecatch / RSS media:thumbnail
  hashtags: string[];          // '#' を除く。RSS では []
  likeCount: number | null;    // RSS では null
  price: number | null;        // 0 は無料。RSS では null
  author: { name: string; urlname: string; imageUrl: string | null };
  source: 'api' | 'rss';
}

/** 詳細ページの記事（v3 notes から作る） */
export interface NoteArticle extends NoteArticleSummary {
  bodyHtml: string;            // サニタイズ済み
  isPartial: boolean;          // can_read === false（有料部分あり → 「続きは note で」）
  eyecatch: { url: string; width: number | null; height: number | null; alt: string } | null;
  toc: { id: string; text: string; level: 2 | 3 }[];
  embeds: { key: string; service: 'note' | 'external-article' | (string & {}); url: string }[];
}

export interface NoteArticlePage {
  articles: NoteArticleSummary[];
  page: number;
  totalCount: number | null;   // RSS では null
  isLastPage: boolean;
}
```

## 6. 人に判断してほしいこと

1. **公開型**：上の案でよいか。特に「RSS で取れない項目を `null` にする」方針と、`isPartial` という名前
2. **パッケージ名**：`note-blog-kit` は npm で未使用（2026-11-12 時点）。このままでよいか
3. **利用規約・robots.txt**の確認（未実施。人の作業）
4. **全件取得のコスト**：1ページ6件固定のため、237件で約40リクエスト。全件取得の上限（例：既定で最大20ページ）を設けるか → **決定済み**：既定 20 ページ、`maxPages` で変更可（#4）
5. **アフィリエイトリンク**：本文中の `external-article` 埋め込みをそのまま表示するか、カードに置き換えるか（Phase 3 の許可リストで決める）
