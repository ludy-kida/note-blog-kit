---
'note-blog-kit': minor
---

`note-blog-kit/server` に `listArticles`（記事一覧の取得）と型付きエラー（`NoteError`・`NoteNotFoundError`・`NoteHttpError`・`NoteNetworkError`・`NoteTimeoutError`・`NoteSchemaError`、`isNoteError`）を追加しました。同じプロセス内の連続リクエストは既定で1秒の間隔を空けます。
