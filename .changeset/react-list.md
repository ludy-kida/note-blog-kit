---
'note-blog-kit': minor
---

`note-blog-kit/react` に一覧表示のコンポーネント `NoteArticleList`・`NoteArticleCard`・`NotePagination` を追加しました。見た目を持たず、`nbk-` から始まる安定したクラス名を付けます。フックを使わないため Server Component としても使えます。リンクは `linkComponent`（Next.js の `Link` など）、日付の表示は `formatDate`、一覧の各項目は `renderItem` で差し替えられます。`react`（18 / 19）を peerDependencies に追加しました。
