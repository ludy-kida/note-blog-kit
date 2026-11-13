---
'note-blog-kit': minor
---

note の見た目に合わせたデフォルト CSS `note-blog-kit/styles.css` を追加しました（任意で読み込み）。すべてのルールは `@layer note-blog-kit` の中にあり、利用者の CSS が常に優先されます。色・フォント・余白・角丸などは `--nbk-*` の CSS 変数で上書きできます。CSS の import がバンドラーに消されないよう、`sideEffects` を `["**/*.css"]` に変更しました。
