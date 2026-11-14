# note-blog-kit

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
