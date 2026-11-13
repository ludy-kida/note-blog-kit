---
'note-blog-kit': minor
---

`note-blog-kit/server` に全件取得の `iterateArticles`（1件ずつ返す AsyncGenerator）と `listAllArticles`（配列で返す）を追加しました。既定では20ページ（120件）で打ち切り、`maxPages` で変更できます。打ち切ったかどうかは `truncated` で分かります。ページがずれて同じ記事が再び出た場合は `key` で重複を除きます。
