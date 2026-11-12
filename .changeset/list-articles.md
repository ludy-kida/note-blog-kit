---
'note-blog-kit': minor
---

`note-blog-kit/server` に記事一覧を取得する `listArticles` を追加しました。

- 既定でページ 1、タイムアウト 10 秒、連続リクエストの間隔 1 秒（プロセス全体で1本の列にまとめて送信）
- 型付きエラー `NoteNotFoundError`・`NoteHttpError`・`NoteNetworkError`・`NoteTimeoutError`・`NoteSchemaError`（基底 `NoteError`）と、`NoteErrorCode`・`NoteSchemaIssue`・`AnyNoteError`
- エラーの判定は `instanceof` ではなく `isNoteError(error)` と `error.code` を推奨（`code` で各エラーの型に絞り込める）
- 公開型（`NoteArticlePage` など）を `note-blog-kit/server` からも型だけ import できるようにした
- 動作環境は Node.js 20 以上
