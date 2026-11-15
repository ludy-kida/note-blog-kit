# 本文 HTML のサニタイズ方針

note の記事本文（`/api/v3/notes/{key}` の `body`）は**信頼できない入力**として扱い、`note-blog-kit/server` で許可リスト方式でサニタイズしてから `NoteArticle.bodyHtml` として返す。サニタイズを外すオプションは作らない。

この方針と XSS テストケース（`packages/note-blog-kit/src/server/sanitize/cases.ts`）の変更は、人の承認が必要（CLAUDE.md・CODEOWNERS）。

## 根拠にした実データ

`fixtures/notes/*.json`（2026-11-12 取得、無料記事 `n55256baa5425`・有料記事 `n52a7f4fa0a2e`）の本文で使われていたもの：

| 要素 | 件数 | 属性 |
| --- | --- | --- |
| `p` | 32 | `name` `id` |
| `br` | 20 | — |
| `strong` | 16 | — |
| `li` | 15 | — |
| `em` | 11 | — |
| `figure` | 9 | `name` `id`、埋め込みでは `data-src` `data-identifier` `embedded-service` `embedded-content-key` |
| `a` | 8 | `href` `rel="nofollow noopener"` `target="_blank"` |
| `h3` | 6 | `name` `id` |
| `ul` | 4 | `name` `id` |
| `figcaption` | 2 | — |
| `table-of-contents` | 2 | `name` `id`（独自要素。中身は `<br>` だけ） |
| `h2` `ol` | 各1 | `name` `id` |
| `blockquote` | 1 | — |
| `img` | 1 | `src`（`https://assets.st-note.com/...`）`alt` `width` `height` |

- `id` はすべて UUID。目次（`index[].name`）は見出しの `id` と一致する
- `href` はすべて https（Amazon のアフィリエイトリンク。クエリに `&amp;` を含む）
- `embedded-service` は `note`（自分の他の記事。`figure` の中身は空）と `external-article`（リンクカードの HTML が中に入っている）

## 1. 許可するタグ

`p` `br` `h2` `h3` `strong` `em` `a` `ul` `ol` `li` `blockquote` `figure` `figcaption` `img`

`table-of-contents` は、目次を差し込む位置の目印として **`<div data-nbk-toc></div>`** に置き換える（中身は捨てる）。React 側（#10）でこの位置に目次を描画できるようにするため。

## 2. 許可しない要素

- **中身ごと消す**：`script` `style` `iframe` `frame` `frameset` `object` `embed` `applet` `form` `input` `button` `textarea` `select` `option` `svg` `math` `template` `noscript` `meta` `link` `base` `title` `xmp` `plaintext`
- **タグだけ消して中身のテキストを残す**：上記以外の、許可していない要素（`div` `span` `font` など）

## 3. 属性

許可リストにない属性はすべて消す（`on*` のイベント属性、`style`、`class`、`srcset`、`srcdoc`、`formaction`、`xlink:href` など）。

| 要素 | 残す属性 | 扱い |
| --- | --- | --- |
| `a` | `href` | スキームが `http:` `https:` `mailto:` のものだけ。それ以外は `href` を消す（リンクのテキストは残す） |
| `a` | `target` | `_blank` のときだけ残す。その場合 `rel` を **`nofollow noopener noreferrer`** に書き換える（元の `rel` は使わない） |
| `img` | `src` | スキームが `https:` のものだけ。それ以外は `img` ごと消す |
| `img` | `alt` `width` `height` | `width` `height` は数字だけのとき残す。`loading="lazy"` と `decoding="async"` を付ける |
| すべての許可タグ | `id` | **`nbk-` を先頭に付けて**残す（例：`nbk-5bf2a080-…`）。目次のリンク先に使う。DOM clobbering（`id="location"` などでページの JavaScript を壊す攻撃）を防ぐため。`NoteTocItem.id` も同じ値にする |
| すべての許可タグ | `name` | 消す（`id` と同じ値で、不要） |
| 埋め込みの `figure` | `embedded-service` | `data-nbk-embed-service` に名前を変えて残す |
| 埋め込みの `figure` | `embedded-content-key` | `data-nbk-embed-key` に名前を変えて残す |
| 埋め込みの `figure` | `data-src` | スキームが `https:` のときだけ、`data-nbk-embed-url` に名前を変えて残す |
| 埋め込みの `figure` | `data-identifier` | 消す |

`id`・`data-nbk-embed-*` の値は、英数字と `-` `_` `.` `:` `/` 以外の文字を含む場合は消す（`data-nbk-embed-url` を除く）。

## 4. URL の判定

- 実体参照（`&#106;` `&#x6A;` `&colon;` など）を解き、前後の空白と制御文字（タブ・改行を含む）を除いたあとのスキームで判定する
- 相対 URL（`/path`・`#hash`・`path`）とプロトコル相対 URL（`//example.com`）は許可しない（note の本文の URL はすべて絶対 URL で、相対 URL は表示するサイトによって意味が変わるため）
- 許可した URL の値は書き換えない（アフィリエイトリンクのクエリを壊さないため）

## 5. 人に判断してほしい点

承認のときに決める。決まったらこの節を「決定事項」に書き換える。

1. **fixture に例のない要素**：note のエディタで使える可能性がある `pre` `code`（コードブロック）`hr`（区切り線）`h4` `table` 系 `s`（取り消し線）などを、最初から許可するか。例が出てから fixture を取り直して足すか
   - 案：最初は許可しない（fixture にないものは使わない、という CLAUDE.md の原則に合わせる）。許可しない要素は「タグだけ消して中身のテキストを残す」ので、文字は失われない
2. **画像の `src` のホスト**：`assets.st-note.com` に限るか、https なら許可するか
   - 案：https なら許可（note が別の CDN に移ったときに画像が全部消えるのを避ける）
3. **アフィリエイトリンクの `rel`**：Google の推奨に合わせて `sponsored` を加えるか
   - 案：加えない（どのリンクがアフィリエイトかをライブラリが判定しない。必要なら利用者が `components` で差し替える）
