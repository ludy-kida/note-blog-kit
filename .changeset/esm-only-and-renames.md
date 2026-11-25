---
"note-blog-kit": minor
---

**破壊的変更**：
- ES Modules のみの配布にしました（CJS のビルドをやめました）。CommonJS からも、Node.js 22.12 以上なら `require()` で読み込めます。
- `createNoteArticlesHandler` の `maxPageNumber` を `maxPage` に改名しました（`maxPages` と紛らわしいため）。
- `NoteArticleList` の `empty` を `labels.empty` に移しました。`labels.paid` で各カードの「有料」の文言も変えられます。
- `source` オプションの型 `NoteSourceOption`（`'api' | 'rss' | 'auto'`）を `note-blog-kit/server`・`note-blog-kit/next` から公開しました。
- `NoteArticlePage` に、実際の取得元 `source`（`'api'` | `'rss'`）を追加しました（`source: 'auto'` で RSS に切り替わったページは `'rss'`）。
