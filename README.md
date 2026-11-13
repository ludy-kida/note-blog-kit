# note-blog-kit

自分の note 記事を、React + TypeScript のサイトに数十行でブログとして載せるためのライブラリ（開発中・仮称）。

## 注意事項

- note の**非公式 API** を利用しており、予告なく動かなくなる可能性があります
- note 株式会社とは無関係のライブラリです
- **自分の記事**を表示する用途を想定しています（他人の記事の転載はしないでください）
- キャッシュを有効にし、高頻度なアクセスはしないでください
- canonical は note の元 URL を推奨します
- 有料部分は表示しません

## 導入手順（Next.js App Router）

### 1. インストール

```bash
npm install note-blog-kit
```

React のコンポーネント（`note-blog-kit/react`）を使う場合は React 18 / 19 が必要です。取得（`note-blog-kit/server`）は Node.js 20 以上で動きます。

### 2. デフォルト CSS を読み込む（任意）

```tsx
// app/layout.tsx
import 'note-blog-kit/styles.css';
```

### 3. 一覧ページを作る

```tsx
// app/blog/page.tsx
import { NoteArticleList, NotePagination } from 'note-blog-kit/react';
import { listArticles } from 'note-blog-kit/server';

// Next.js のデータキャッシュで1時間ごとに取り直す（高頻度に note へアクセスしないため）
const cachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, next: { revalidate: 3600 } });

type Props = { searchParams: Promise<{ page?: string }> };

export default async function BlogPage({ searchParams }: Props) {
  const page = Number((await searchParams).page ?? '1') || 1;
  const { articles, isLastPage, totalCount } = await listArticles({ user: 'your_urlname', page, fetch: cachedFetch });
  return (
    <main>
      <h1>ブログ</h1>
      <NoteArticleList articles={articles} />
      <NotePagination page={page} isLastPage={isLastPage} totalCount={totalCount} getHref={(p) => `/blog?page=${p}`} />
    </main>
  );
}
```

記事のリンク先は、既定では note の記事ページです。自分のサイトの詳細ページにしたい場合は `getHref` と `linkComponent={Link}` を渡します（詳細ページの作り方は今後のリリースで追加します）。

### キャッシュの推奨

- `listArticles` は呼ぶたびに note へリクエストします。**必ずキャッシュしてください**。Next.js なら上の例のように `fetch` に `next: { revalidate }` を付けるのが簡単です
- 全件の取得（`listAllArticles`）は1ページ6件ずつ取りに行くため時間がかかります。ビルド時やキャッシュの更新時に行ってください
- 同じプロセス内の連続リクエストは、ライブラリが自動で1秒以上空けます

動く例は [`examples/next`](examples/next) にあります（下の「開発」を参照）。

## 使い方（開発中・API は 0.x の間に変わることがあります）

### 記事一覧を取得する（サーバー側）

note は CORS に対応していないため、取得はサーバー側（Next.js の Server Component・Route Handler、ビルド時のスクリプトなど）で行います。

```ts
import { isNoteError, listArticles } from 'note-blog-kit/server';

try {
  const { articles, isLastPage, totalCount } = await listArticles({ user: 'your_urlname', page: 1 });
} catch (error) {
  if (isNoteError(error) && error.code === 'NOTE_NOT_FOUND') {
    // ユーザーが見つからない
  }
  throw error;
}
```

| オプション | 既定値 | 説明 |
| --- | --- | --- |
| `user` | （必須） | note のユーザー名（英数字・`_`・`-`） |
| `page` | `1` | ページ番号。1ページは6件 |
| `timeoutMs` | `10000` | タイムアウト（ミリ秒） |
| `minIntervalMs` | `1000` | 連続リクエストの最小間隔（ミリ秒）。プロセス全体で1本の列にまとめて送ります |
| `signal` | — | 中断用の `AbortSignal` |
| `fetch` | `globalThis.fetch` | fetch の差し替え（テスト・キャッシュ層用）。Cookie・認証ヘッダーは付けないでください |

エラーは `code` で判別します：`NOTE_NOT_FOUND`（404）、`NOTE_HTTP_ERROR`（その他の HTTP エラー、`status` あり）、`NOTE_NETWORK_ERROR`、`NOTE_TIMEOUT`、`NOTE_SCHEMA_ERROR`（note のレスポンスの形が変わった）。

結果はキャッシュし、高頻度に呼び出さないでください（Next.js なら `revalidate` を設定するなど）。

### 全件を取得する（ビルド時向け）

1ページは6件固定のため、全件の取得には多くのリクエストが必要です（237件なら約40回、1秒間隔で約40秒）。全件取得はビルド時やキャッシュの更新時に行ってください。既定では **20ページ（120件）で打ち切ります**。

```ts
import { iterateArticles, listAllArticles } from 'note-blog-kit/server';

// 配列でまとめて取得する
const { articles, truncated } = await listAllArticles({ user: 'your_urlname', maxPages: 50 });
if (truncated) {
  // maxPages に達して打ち切った（続きがある）
}

// 1件ずつ処理する
for await (const article of iterateArticles({ user: 'your_urlname' })) {
  console.log(article.title);
}
```

`maxPages`（既定 `20`）以外のオプションは `listArticles` と同じです（`page` は指定できません）。取得中に新しい記事が公開されてページがずれた場合も、同じ記事は1回だけ返します。

- `truncated: true` は `maxPages` に達して打ち切ったことを表します（続きがある可能性があります）
- `listAllArticles` は途中のページで失敗すると、それまでに集めた記事を返さずにエラーを投げます。途中までの記事も使いたい場合は `iterateArticles` を使ってください
- `for await` では打ち切りの有無を受け取れません。必要なら `listAllArticles` を使うか、`next()` を手で回して戻り値（`done: true` のときの `value`）を読んでください

### 一覧を表示する（React）

`note-blog-kit/react` のコンポーネントは、取得済みのデータを受け取って描画するだけです。見た目は持たず、`nbk-` から始まるクラス名を付けます。フックを使わないため、Server Component としても使えます（React 18 / 19）。

```tsx
import Link from 'next/link';
import { NoteArticleList, NotePagination } from 'note-blog-kit/react';
import { listArticles } from 'note-blog-kit/server';

export default async function BlogPage() {
  const { articles, page, isLastPage, totalCount } = await listArticles({ user: 'your_urlname' });
  return (
    <>
      <NoteArticleList articles={articles} linkComponent={Link} getHref={(article) => `/blog/${article.key}`} />
      <NotePagination page={page} isLastPage={isLastPage} totalCount={totalCount} getHref={(p) => `/blog?page=${p}`} />
    </>
  );
}
```

| コンポーネント | 主な props と既定値 |
| --- | --- |
| `NoteArticleList` | `articles`（必須）、`getHref`（既定は note の記事 URL）、`linkComponent`（既定 `'a'`）、`formatDate`（既定は日本時間の `YYYY/MM/DD`）、`headingLevel`（既定 `2`）、`renderItem`（各記事の描画を差し替え）、`empty`（既定「記事がありません」） |
| `NoteArticleCard` | `article`（必須）、`href`（既定は note の記事 URL）、`linkComponent`、`formatDate`、`headingLevel`、`labels.paid`（既定「有料」） |
| `NotePagination` | `page`・`isLastPage`・`getHref`（必須）、`totalCount`（あれば「3 / 40」と表示）、`perPage`（既定 `6`）、`linkComponent`、`labels`（既定「前へ」「次へ」、aria-label「ページ送り」） |

- **クラス名**：`nbk-card`（`__eyecatch`・`__title`・`__link`・`__date`・`__badge`・`__excerpt`・`__tags`・`__tag`）、`nbk-article-list`（`__item`、0件のときは `--empty` と `__empty`）、`nbk-pagination`（`__prev`・`__next`・`__status`）。`className` を渡すと、既定のクラス名に追加されます
- **リンク先に信頼できない値を渡さない**：`href`・`getHref` の値はそのまま `href` 属性に入ります。React 18 は `javascript:` の URL をブロックしません。既定値（note の記事 URL）は、http(s) でなければリンクにしません
- **Next.js の typedRoutes**：有効にしている場合は `Link` の `href` が文字列を受け付けないため、`Link` を包んだコンポーネントを `linkComponent` に渡してください
- **見出し画像**：note の CDN（assets.st-note.com）から直接読み込みます

### デフォルト CSS（任意）

note の見た目に合わせた CSS を用意しています。読み込まなければ、コンポーネントは見た目を持ちません。

```ts
// Next.js（App Router）なら app/layout.tsx、Pages Router なら pages/_app.tsx、Vite なら main.tsx などで読み込む
import 'note-blog-kit/styles.css';
```

CSS は `:root`（変数の既定値）と `nbk-` から始まるクラスにだけ当たり、サイトの他の要素には影響しません。色や余白は CSS 変数で変えられます。

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `--nbk-font-family` | Hiragino Sans など | 文字（サイトのフォントを使うなら `inherit`） |
| `--nbk-color-text` | `#08131a` | タイトルなど |
| `--nbk-color-muted` | `#6e7b85` | 日付・抜粋・タグ・件数 |
| `--nbk-color-accent` | `#41c9b4` | ホバー・フォーカス |
| `--nbk-color-border` | `#e6e6e6` | 枠線 |
| `--nbk-color-placeholder` | `#f2f2f2` | 見出し画像の読み込み中の下地 |
| `--nbk-color-surface` | `transparent` | カードの背景（既定はページの背景のまま） |
| `--nbk-color-badge-bg` / `--nbk-color-badge-text` | `#08131a` / `#fff` | 「有料」バッジ |
| `--nbk-radius` | `8px` | 角丸 |
| `--nbk-list-gap` | `24px` | 一覧のカードの間隔、ページ送りの上下の余白 |
| `--nbk-card-min-width` | `280px` | 一覧で1枚のカードが取る最小幅 |

#### 優先順位（カスケードレイヤー）

すべてのルールは `@layer note-blog-kit` の中にあります。

- **レイヤーに入っていないあなたの CSS** は、詳細度に関係なく note-blog-kit より優先されます。サイト全体の要素スタイル（例：`a { text-decoration: underline }`、`h2 { margin: ... }`）もカードに効くので、必要ならクラス名で打ち消してください
- **あなたがレイヤーを使っている場合**（Tailwind CSS v4 など）は、レイヤーの順序は最初に宣言された順で決まります。読み込む順番に頼らず、順序を宣言してください。Tailwind v4 なら、リセット（`base`）より後・ユーティリティ（`utilities`）より前に置くと、リセットで太字や余白が消えず、`className` に渡したユーティリティクラスが効きます

```css
/* Tailwind v4 の例：グローバル CSS の先頭で順序を宣言する */
@layer theme, base, note-blog-kit, components, utilities;
@import "tailwindcss";
```

```css
/* ブランド色に合わせる */
:root {
  --nbk-color-accent: #e5004f;
}

/* ダークモード（既定では配色を変えません） */
@media (prefers-color-scheme: dark) {
  :root {
    --nbk-color-text: #f1f1f1;
    --nbk-color-muted: #a3adb4;
    --nbk-color-border: #333;
    --nbk-color-placeholder: #222;
  }
}

/* 個別の調整はクラス名で（レイヤーに入れなければ詳細度を気にせず上書きできる） */
.nbk-card__title {
  font-size: 1.125rem;
}
```

## 開発

v0.1.0（一覧表示）に向けて開発中です。fixture の取得手順は [fixtures/README.md](fixtures/README.md)、エージェント向けのルールは [CLAUDE.md](CLAUDE.md) を参照してください。

### examples/next を動かす

```bash
pnpm install
pnpm build
```

```bash
# fixtures/ の保存済みレスポンスで動かす（note にアクセスしない）
NOTE_BLOG_KIT_FIXTURES=1 pnpm -C examples/next dev
```

```bash
# 実際の note から取得する（NOTE_USER に自分の urlname を指定）
NOTE_USER=your_urlname pnpm -C examples/next dev
```

CI は `pnpm build:examples` で、fixture モードのビルドと一覧ページが30行以内であることを確認しています。

## ライセンス

MIT
