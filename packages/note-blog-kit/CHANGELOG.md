# note-blog-kit

## 0.4.0

### Minor Changes

- d49ebe2: **破壊的変更**：エラーモデルを v1.0 に向けて整理しました。
  - HTTP 429 は `NOTE_HTTP_ERROR` ではなく、新しい `NOTE_RATE_LIMITED`（`NoteRateLimitError`。`retryAfterSeconds` で `Retry-After` の秒数を読めます）になりました。
  - `NoteNetworkError`・`NoteTimeoutError`・`NoteSchemaError` に `url` を追加しました（`NoteSchemaError` の `url` は `string | null` で、取得関数から投げられるときは必ず入ります）。
  - エラーのコンストラクタを内部用（`@internal`）にし、`NoteErrorOptions` の export をやめました。
  - `NoteErrorCode` はマイナーバージョンで増えることがあります（`switch` には `default` を書いてください）。
  - URL から受け取った記事キーを確かめる `isNoteArticleKey` を追加しました。
- 39fbaa1: **破壊的変更**：
  
  - ES Modules のみの配布にしました（CJS のビルドをやめました）。CommonJS からも、Node.js 22.12 以上なら `require()` で読み込めます。TypeScript の CommonJS のプロジェクトでは `moduleResolution` を `nodenext`（TypeScript 5.8 以上）か `bundler` にしてください。
  - `createNoteArticlesHandler` の `maxPageNumber` を `maxPage` に改名しました（`maxPages` と紛らわしいため）。古い名前を渡すと `TypeError` になります。
  - `NoteArticleList` の `empty` を `labels.empty` に移しました。
  - `NoteArticlePage` に、実際の取得元 `source`（`'api'` | `'rss'`）を追加しました（`source: 'auto'` で RSS に切り替わったページは `'rss'`）。`NoteArticlePage` を自分で作っている場合（テストのデータなど）は `source` が必要です。
  
  移行の例：
  
  ```ts
  // 0.3
  createNoteArticlesHandler({ user: 'your_urlname', maxPageNumber: 20 });
  <NoteArticleList articles={articles} empty="まだ記事がありません" />
  
  // 0.4
  createNoteArticlesHandler({ user: 'your_urlname', maxPage: 20 });
  <NoteArticleList articles={articles} labels={{ empty: 'まだ記事がありません' }} />
  ```
  
  **追加**：
  
  - `NoteArticleList` の `labels.paid` で、各カードの「有料」の文言を変えられます。
  - `source` オプションの型 `NoteSourceOption`（`'api' | 'rss' | 'auto'`）を `note-blog-kit/server`・`note-blog-kit/next` から公開しました。
- f501936: **破壊的変更**：`getArticle` に必須の `user` を追加しました。`user` に指定した著者（大文字小文字も含めて一致）の記事だけを返し、ほかの著者の記事は `NoteNotFoundError`（`NOTE_NOT_FOUND`）になります。複数の著者で運用するサイトでは `user: ['alice', 'bob']` のように配列で指定できます。空の配列や不正な名前を渡すと、送信する前に `TypeError` になります。移行するには、`getArticle({ key })` を `getArticle({ key, user: 'your_urlname' })` にし、`article.author.urlname` を手で確かめていた処理を消してください。著者が違う場合のエラーは、記事が存在しない場合と同じ文面で、実際の著者名は含みません。CLI `sync` も、著者が `--user` でない記事をこの仕組みで書き出しません（stderr には `NOTE_NOT_FOUND` と出ます）。
- 6cc8b62: CLI `sync` が書き出す `articles.json` に形式のバージョン（`version: 1`）を入れ、その型 `NoteSyncedArticleList` を `note-blog-kit` から公開しました。`useNoteArticles` はバージョン 1 と、`version` のない v0.3 までの `articles.json` を読み、知らないバージョンはエラーにします。中継エンドポイント（`createNoteArticlesHandler`）のエラーの型 `NoteArticlesHandlerErrorCode`・`NoteArticlesHandlerErrorBody` も公開し、`NoteErrorCode` を `note-blog-kit` からも import できるようにしました（`note-blog-kit/server` からも引き続き import できます）。
- b268c5f: **破壊的変更**：`useNoteArticles` の戻り値のページ情報を `page` から `data` に改名しました（ページの番号 `data.page` と紛らわしくないように）。移行するには `result.page` を `result.data` にしてください。また `error` は `UseNoteArticlesError`（`Error` を継承）になり、`status`（HTTP ステータス）と `code`（中継エンドポイントが返したエラーコード。`NoteArticlesHandlerErrorCode`）を読めるようになりました。結果オブジェクトを自分で作っている場合（テストのモックなど）は、`error` の型を `UseNoteArticlesError` にしてください。`note-blog-kit/react` から `NoteArticlesHandlerErrorCode`・`NoteErrorCode` の型も import できるようにしました。

### Patch Changes

- d852beb: 記事本文の大きさに上限を設けました。次の記事は `NoteSchemaError`（`NOTE_SCHEMA_ERROR`）になります（細工した本文でサーバーの処理を長時間止められないようにするため）：本文が 30万文字を超える、`<img>`・`<div>` が合計 2,000 個を超える、タグの入れ子が 256 段を超える。また `getArticle` は、記事キーと著者の確認を本文の処理より前に行うようになりました。
- 3218a7c: 本文のサニタイズと描画を変更しました。
  
  - テキストも画像もないリンクを出力しないようにしました。外部記事のリンクカードで、外部画像を除いた後に名前のない空のリンクが残っていました。
  - `noembed`・`noframes` を中身ごと消すようにしました。
  - `NoteArticleBody` で、正規化を通らない本文に `<embed>` があると、その後ろの本文が描画されない問題を直しました。
- c56a233: CLI `sync` を失敗に強くしました。前回の出力に記事があるのに今回の一覧が空なら、何も書き換えずに終了コード 1 で終わります（空にしてよい場合は新しい `--allow-empty` を付けます）。本文を一時的に取得できなかった記事（通信の失敗・タイムアウト・5xx・429）は前回の本文を残し、それ以外の失敗（404・ほかの 4xx・形の違い）と一覧にない記事の本文は消します。出力先の `articles` がシンボリックリンクなら（取得の途中で差し替えられた場合も）、書き出しと削除を止めて終了コード 1 で終わります。

## 0.3.0

### Minor Changes

- 7bd5548: CLI `note-blog-kit sync --user <urlname> --out <dir>` を追加しました。記事の一覧（`articles.json`）と本文（`articles/<key>.json`）を JSON に書き出します。`--max-pages`（既定 20）で一覧のページ数を、`--no-body` で一覧だけにできます。リクエストは1秒以上の間隔で1件ずつ送ります。
- c47a6f5: `listArticles`・`iterateArticles`・`listAllArticles` に `source` オプション（`'api'` | `'rss'` | `'auto'`、既定 `'api'`）を追加しました。`'rss'` は note の RSS（最新25件・1ページ）から取得し、`'auto'` は API が 404・5xx・形の違いで失敗したときに RSS に切り替えます。RSS では `hashtags` が空、`likeCount`・`price`・`totalCount` が `null` になります。`note-blog-kit/next` の `generateNoteStaticParams` も `source` を受け付けます（RSS では最新25件だけ）。
- 395cc0e: SPA（Vite など）向けに、クライアント用のフック `useNoteArticles`（`note-blog-kit/react`）と、中継エンドポイントを作る `createNoteArticlesHandler`（`note-blog-kit/next`）を追加しました。`useNoteArticles` は中継エンドポイントか `note-blog-kit sync` の `articles.json` から一覧を取得し、ブラウザから note へは直接アクセスしません。中継エンドポイントは成功した応答にキャッシュヘッダーを付けます。

## 0.2.0

### Minor Changes

- 9951d4e: `NoteArticleBody` を追加しました（`note-blog-kit/react`）。`getArticle` で取得した本文を、`dangerouslySetInnerHTML` を使わずに描画します。画像・見出し・埋め込み・目次を `components` で置き換えられ、有料記事では「続きは note で」リンクを出します。デフォルト CSS に、note の本文に合わせたスタイル（`nbk-body`・`nbk-body__*`・`nbk-toc`・`nbk-embed`）と変数（`--nbk-body-*`・`--nbk-color-subtle`・`--nbk-color-button-*`）を追加しました。
- 0301ba0: `getArticle({ key })` を追加しました（`note-blog-kit/server`）。記事1件を取得し、サニタイズ済みの本文・目次・埋め込み・見出し画像を持つ `NoteArticle` を返します。取得関数に共通するオプションの型 `NoteRequestOptions` を追加し、`ListArticlesOptions`・`GetArticleOptions` はこれを継承するようにしました（オプションの内容は変わりません）。
- 469acec: `note-blog-kit/next` に `generateNoteMetadata`（canonical の既定値は note の元 URL）と `generateNoteStaticParams`（`maxPages` で打ち切る）を追加しました。どちらも `next` には依存せず、Next.js の `Metadata`・`generateStaticParams` にそのまま渡せます。
- b206d05: 対応する Node.js を 22.12 以上に上げました（Node.js 20 はサポートを終了しています）。本文 HTML のサニタイズに使う `sanitize-html` を依存に追加しました。

### Patch Changes

- 58dc5b3: 見出し画像のない記事が一覧にあると、`listArticles` などが `NoteSchemaError` で失敗していたのを直しました（`eyecatchUrl` は `null` になります）。
- bd78fc2: 一覧の取得（`listArticles` など）で、記事キーと著者のユーザー名の形式を検証するようにしました。想定と違う形式のときは `NoteSchemaError` になります（`getArticle` と同じ規則）。

## 0.1.0

### Minor Changes

- aafea3c: note の見た目に合わせたデフォルト CSS `note-blog-kit/styles.css` を追加しました（任意で読み込み）。
  
  - すべてのルールは `@layer note-blog-kit` の中にあり、レイヤーに入っていない利用者の CSS が優先されます（Tailwind v4 などレイヤーを使うサイトでの順序の指定方法は README を参照）
  - 色・フォント・余白・角丸などは `--nbk-*` の CSS 変数で上書きできます
  - セレクタは `:root` と `nbk-` から始まるクラスだけで、サイトの他の要素には影響しません
  - CSS の import がバンドラーに消されないよう、`sideEffects` を `["**/*.css"]` に変更しました
- 0440e52: `note-blog-kit/server` に全件取得の `iterateArticles`（1件ずつ返す AsyncGenerator）と `listAllArticles`（配列で返す）を追加しました。既定では20ページ（120件）で打ち切り、`maxPages` で変更できます。打ち切ったかどうかは `truncated` で分かります。ページがずれて同じ記事が再び出た場合は `key` で重複を除きます。
- 55b36f9: `note-blog-kit/server` に記事一覧を取得する `listArticles` を追加しました。
  
  - 既定でページ 1、タイムアウト 10 秒、連続リクエストの間隔 1 秒（プロセス全体で1本の列にまとめて送信）
  - 型付きエラー `NoteNotFoundError`・`NoteHttpError`・`NoteNetworkError`・`NoteTimeoutError`・`NoteSchemaError`（基底 `NoteError`）と、`NoteErrorCode`・`NoteSchemaIssue`・`AnyNoteError`
  - エラーの判定は `instanceof` ではなく `isNoteError(error)` と `error.code` を推奨（`code` で各エラーの型に絞り込める）
  - 公開型（`NoteArticlePage` など）を `note-blog-kit/server` からも型だけ import できるようにした
  - 動作環境は Node.js 20 以上
- 6743acb: `note-blog-kit/react` に一覧表示のコンポーネント `NoteArticleList`・`NoteArticleCard`・`NotePagination` を追加しました。
  
  - 見た目を持たず、`nbk-` から始まる安定したクラス名を付けます。フックを使わないため Server Component としても使えます
  - リンクは `linkComponent`（Next.js の `Link` など）、リンク先は `href`・`getHref`、日付の表示は `formatDate`、見出しレベルは `headingLevel`、一覧の各項目は `renderItem`、文言は `labels`・`empty` で差し替えられます
  - `react`（18 / 19）を任意の peerDependencies に追加しました（`/server` だけを使う場合は不要）
  - 一覧 API の正規化で、記事 URL・見出し画像・プロフィール画像の URL を https に限るようにしました（それ以外は `NoteSchemaError`）

### Patch Changes

- 9308f7e: README に Next.js（App Router）での導入手順（インストール、CSS の読み込み、一覧ページ、キャッシュの推奨）を追加しました。
