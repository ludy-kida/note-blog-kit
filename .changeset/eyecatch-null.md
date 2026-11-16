---
"note-blog-kit": patch
---

見出し画像のない記事が一覧にあると、`listArticles` などが `NoteSchemaError` で失敗していたのを直しました（`eyecatchUrl` は `null` になります）。
