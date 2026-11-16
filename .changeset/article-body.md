---
"note-blog-kit": minor
---

`NoteArticleBody` を追加しました（`note-blog-kit/react`）。`getArticle` で取得した本文を、`dangerouslySetInnerHTML` を使わずに描画します。画像・見出し・埋め込み・目次を `components` で置き換えられ、有料記事では「続きは note で」リンクを出します。デフォルト CSS に、note の本文に合わせたスタイル（`nbk-body`）と `--nbk-body-*` 変数を追加しました。
