---
"note-blog-kit": patch
---

一覧の取得（`listArticles` など）で、記事キーと著者のユーザー名の形式を検証するようにしました。想定と違う形式のときは `NoteSchemaError` になります（`getArticle` と同じ規則）。
