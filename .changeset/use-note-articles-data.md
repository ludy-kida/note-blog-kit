---
"note-blog-kit": minor
---

**破壊的変更**：`useNoteArticles` の戻り値のページ情報を `page` から `data` に改名しました（ページの番号 `data.page` と紛らわしくないように）。移行するには `result.page` を `result.data` にしてください。また `error` は `UseNoteArticlesError`（`Error` を継承）になり、`status`（HTTP ステータス）と `code`（中継エンドポイントが返したエラーコード。`NoteArticlesHandlerErrorCode`）を読めるようになりました。
