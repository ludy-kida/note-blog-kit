---
"note-blog-kit": minor
---

CLI `sync` が書き出す `articles.json` に形式のバージョン（`version: 1`）を入れ、その型 `NoteSyncedArticleList` を `note-blog-kit` から公開しました。`useNoteArticles` はバージョン 1 と、`version` のない v0.3 までの `articles.json` を読み、知らないバージョンはエラーにします。中継エンドポイント（`createNoteArticlesHandler`）のエラーの型 `NoteArticlesHandlerErrorCode`・`NoteArticlesHandlerErrorBody` も公開し、`NoteErrorCode` を `note-blog-kit` からも import できるようにしました（`note-blog-kit/server` からも引き続き import できます）。
