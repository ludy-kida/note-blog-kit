# 本文 HTML のサニタイズ方針

note の記事本文（`/api/v3/notes/{key}` の `body`）は**信頼できない入力**として扱い、`note-blog-kit/server` で許可リスト方式でサニタイズしてから `NoteArticle.bodyHtml` として返す。サニタイズを外すオプションは作らない。

この方針と XSS テストケース（`packages/note-blog-kit/src/server/sanitize/cases.ts`）の変更は、人の承認が必要（CLAUDE.md・CODEOWNERS）。

許可するタグ・中身ごと消す要素・画像の読み込み元・属性値に使える文字は、`packages/note-blog-kit/src/core/body-policy.ts` の1か所にまとめている（#47）。`/server` のサニタイズと、`/react` の描画（正規化を通らないデータのための保険の絞り込み）の両方がこの値を使う。一覧は `core/body-policy.test.ts` で固定しているので、変えるとテストにも差分が出る。

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

- fixture で使われている要素：`p` `br` `h2` `h3` `strong` `em` `a` `ul` `ol` `li` `blockquote` `figure` `figcaption` `img`
- fixture に例はないが、note のエディタで使える要素（人の判断で許可。決定事項 1）：`pre` `code` `hr` `h4` `s` `table` `thead` `tbody` `tr` `th` `td`
  - `th` `td` は `colspan` `rowspan`（数字だけ）を残す

`table-of-contents` は、目次を差し込む位置の目印として **`<div data-nbk-toc></div>`** に置き換える（中身は捨てる）。React 側（#10）でこの位置に目次を描画できるようにするため。

## 2. 許可しない要素

- **中身ごと消す**：`script` `style` `iframe` `frame` `frameset` `object` `applet` `form` `button` `textarea` `select` `option` `svg` `math` `template` `noscript` `title` `xmp` `plaintext` `noembed` `noframes`
  - `noembed` `noframes` は #47 で足した（それまで `/server` ではタグだけ消えて中のテキストが残っていた。`/react` ではすでに中身ごと消していた）
- **消す（中身のない void 要素）**：`embed` `input` `meta` `link` `base`
  - `/react` は中身ごと消す要素を閉じタグまで読み飛ばすので、閉じタグのない void 要素はこちらに分けている（#47。それまで `/react` では `<embed>` の後ろの本文がすべて消えていた）
- **タグだけ消して中身のテキストを残す**：上記以外の、許可していない要素（`div` `span` `font` など）

## 3. 属性

許可リストにない属性はすべて消す（`on*` のイベント属性、`style`、`class`、`srcset`、`srcdoc`、`formaction`、`xlink:href` など）。

| 要素 | 残す属性 | 扱い |
| --- | --- | --- |
| `a` | `href` | スキームが `http:` `https:` `mailto:` のものだけ。それ以外は `href` を消す（リンクのテキストは残す） |
| `a` | `target` | `_blank` のときだけ残す |
| `a` | `rel` | 元の `rel` は使わず、次の規則で付け直す。`target="_blank"` なら `nofollow noopener noreferrer`、アフィリエイトリンク（下記）なら `sponsored` を加える。どちらでもなければ付けない |
| `img` | `src` | **`https://assets.st-note.com/` で始まるものだけ**（決定事項 2）。それ以外は `img` ごと消す |
| `img` | `alt` `width` `height` | `width` `height` は数字だけのとき残す。`loading="lazy"` と `decoding="async"` を付ける |
| すべての許可タグ | `id` | **`nbk-` を先頭に付けて**残す（例：`nbk-5bf2a080-…`）。目次のリンク先に使う。DOM clobbering（`id="location"` などでページの JavaScript を壊す攻撃）を防ぐため。`NoteTocItem.id` も同じ値にする |
| すべての許可タグ | `name` | 消す（`id` と同じ値で、不要） |
| 埋め込みの `figure` | `embedded-service` | `data-nbk-embed-service` に名前を変えて残す |
| 埋め込みの `figure` | `embedded-content-key` | `data-nbk-embed-key` に名前を変えて残す |
| 埋め込みの `figure` | `data-src` | スキームが `https:` のときだけ、`data-nbk-embed-url` に名前を変えて残す |
| 埋め込みの `figure` | `data-identifier` | 消す |

### 空のリンク（#47）

テキスト（空白以外）も、残る画像（上の規則で残す `img`）もない `a` は、タグだけ消す（中の空白は残す）。外部記事のリンクカードには外部画像だけを包んだ `a` があり、画像を消すと名前のないリンクが残る（WCAG 2.4.4・4.1.2 に反する）ため。`/react` の描画でも同じ条件の `a` は描画しない。

`id`・`data-nbk-embed-*` の値は、英数字と `-` `_` `.` `:` `/` 以外の文字を含む場合は消す（`data-nbk-embed-url` を除く）。

### アフィリエイトリンクの判定（決定事項 3）

`href` が次のどれかに当てはまるリンクをアフィリエイトリンクとみなし、`rel` に `sponsored` を加える。一覧にないサービスは判定しない（必要になったら、この一覧に足す）。

| サービス | 条件 |
| --- | --- |
| Amazon アソシエイト | ホストが `amazon.co.jp`・`www.amazon.co.jp`・`amazon.com`・`www.amazon.com` で、クエリに `tag` がある。またはホストが `amzn.to`・`amzn.asia`（短縮 URL） |
| 楽天アフィリエイト | ホストが `hb.afl.rakuten.co.jp` |
| もしもアフィリエイト | ホストが `af.moshimo.com` |
| A8.net | ホストが `px.a8.net` |
| バリューコマース | ホストが `ck.jp.ap.valuecommerce.com` |

ホストは大文字・小文字を区別せずに比較する。サブドメインの前方一致（`*.amazon.co.jp` など）はしない。

## 4. URL の判定

- 実体参照（`&#106;` `&#x6A;` `&colon;` など）を解き、前後の空白と制御文字（タブ・改行を含む）を除いたあとのスキームで判定する
- 相対 URL（`/path`・`#hash`・`path`）とプロトコル相対 URL（`//example.com`）は許可しない（note の本文の URL はすべて絶対 URL で、相対 URL は表示するサイトによって意味が変わるため）
- 許可した URL の値は書き換えない（アフィリエイトリンクのクエリを壊さないため）

## 5. 決定事項（2026-11-15、人が判断）

1. **fixture に例のない要素を最初から許可する**：`pre` `code` `hr` `h4` `s` と `table` 系。note のエディタで使える要素を、例が出る前から表示できるようにする。CLAUDE.md の「fixture にないキーを使わない」は JSON のキーの原則で、本文 HTML の要素はこの決定に従う
2. **画像の読み込み元を `assets.st-note.com` に限る**：note の画像以外を読み込ませない。note が CDN を変えた場合は、この一覧を更新する（そのときは画像が表示されなくなるので、契約テストか利用者の報告で気づく）
3. **アフィリエイトリンクに `rel="sponsored"` を付ける**：判定の条件は「アフィリエイトリンクの判定」の表のとおり
