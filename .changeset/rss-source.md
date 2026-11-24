---
"note-blog-kit": minor
---

`listArticles`・`iterateArticles`・`listAllArticles` に `source` オプション（`'api'` | `'rss'` | `'auto'`、既定 `'api'`）を追加しました。`'rss'` は note の RSS（最新25件・1ページ）から取得し、`'auto'` は API が 404・5xx・形の違いで失敗したときに RSS に切り替えます。RSS では `hashtags` が空、`likeCount`・`price`・`totalCount` が `null` になります。`note-blog-kit/next` の `generateNoteStaticParams` も `source` を受け付けます（RSS では最新25件だけ）。
