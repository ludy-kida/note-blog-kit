---
"note-blog-kit": minor
---

SPA（Vite など）向けに、クライアント用のフック `useNoteArticles`（`note-blog-kit/react`）と、中継エンドポイントを作る `createNoteArticlesHandler`（`note-blog-kit/next`）を追加しました。`useNoteArticles` は中継エンドポイントか `note-blog-kit sync` の `articles.json` から一覧を取得し、ブラウザから note へは直接アクセスしません。中継エンドポイントは成功した応答にキャッシュヘッダーを付けます。
