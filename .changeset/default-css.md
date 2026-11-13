---
'note-blog-kit': minor
---

note の見た目に合わせたデフォルト CSS `note-blog-kit/styles.css` を追加しました（任意で読み込み）。

- すべてのルールは `@layer note-blog-kit` の中にあり、レイヤーに入っていない利用者の CSS が優先されます（Tailwind v4 などレイヤーを使うサイトでの順序の指定方法は README を参照）
- 色・フォント・余白・角丸などは `--nbk-*` の CSS 変数で上書きできます
- セレクタは `:root` と `nbk-` から始まるクラスだけで、サイトの他の要素には影響しません
- CSS の import がバンドラーに消されないよう、`sideEffects` を `["**/*.css"]` に変更しました
