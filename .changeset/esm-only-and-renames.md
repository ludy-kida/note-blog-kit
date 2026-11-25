---
"note-blog-kit": minor
---

**破壊的変更**：

- ES Modules のみの配布にしました（CJS のビルドをやめました）。CommonJS からも、Node.js 22.12 以上なら `require()` で読み込めます。TypeScript の CommonJS のプロジェクトでは `moduleResolution` を `nodenext`（TypeScript 5.8 以上）か `bundler` にしてください。
- `createNoteArticlesHandler` の `maxPageNumber` を `maxPage` に改名しました（`maxPages` と紛らわしいため）。古い名前を渡すと `TypeError` になります。
- `NoteArticleList` の `empty` を `labels.empty` に移しました。
- `NoteArticlePage` に、実際の取得元 `source`（`'api'` | `'rss'`）を追加しました（`source: 'auto'` で RSS に切り替わったページは `'rss'`）。`NoteArticlePage` を自分で作っている場合（テストのデータなど）は `source` が必要です。

移行の例：

```ts
// 0.3
createNoteArticlesHandler({ user: 'your_urlname', maxPageNumber: 20 });
<NoteArticleList articles={articles} empty="まだ記事がありません" />

// 0.4
createNoteArticlesHandler({ user: 'your_urlname', maxPage: 20 });
<NoteArticleList articles={articles} labels={{ empty: 'まだ記事がありません' }} />
```

**追加**：

- `NoteArticleList` の `labels.paid` で、各カードの「有料」の文言を変えられます。
- `source` オプションの型 `NoteSourceOption`（`'api' | 'rss' | 'auto'`）を `note-blog-kit/server`・`note-blog-kit/next` から公開しました。
