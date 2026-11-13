---
'note-blog-kit': minor
---

`note-blog-kit/react` に一覧表示のコンポーネント `NoteArticleList`・`NoteArticleCard`・`NotePagination` を追加しました。

- 見た目を持たず、`nbk-` から始まる安定したクラス名を付けます。フックを使わないため Server Component としても使えます
- リンクは `linkComponent`（Next.js の `Link` など）、リンク先は `href`・`getHref`、日付の表示は `formatDate`、見出しレベルは `headingLevel`、一覧の各項目は `renderItem`、文言は `labels`・`empty` で差し替えられます
- `react`（18 / 19）を任意の peerDependencies に追加しました（`/server` だけを使う場合は不要）
- 一覧 API の正規化で、記事 URL・見出し画像・プロフィール画像の URL を https に限るようにしました（それ以外は `NoteSchemaError`）
