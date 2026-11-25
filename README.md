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

React のコンポーネント（`note-blog-kit/react`）を使う場合は React 18 / 19 が必要です。取得（`note-blog-kit/server`）は Node.js 22.12 以上で動きます。

### 2. デフォルト CSS を読み込む（任意）

```tsx
// app/layout.tsx
import 'note-blog-kit/styles.css';
```

### 3. 一覧ページを作る

```tsx
// app/blog/page.tsx
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { NoteArticleList, NotePagination } from 'note-blog-kit/react';
import { listArticles } from 'note-blog-kit/server';

// 取得結果を1時間キャッシュする（キャッシュに当たれば note へのリクエストも、ライブラリの間隔待ちも起きない）。
// ユーザー名は引数にしてキャッシュのキーに含める（変えたときに前のユーザーの記事が出ないように）
const getPage = unstable_cache(
  (user: string, page: number) => listArticles({ user, page }),
  ['note-articles'],
  { revalidate: 3600 },
);

type Props = { searchParams: Promise<{ page?: string }> };

export default async function BlogPage({ searchParams }: Props) {
  const page = Number((await searchParams).page ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 100) notFound();
  const { articles, isLastPage, totalCount } = await getPage('your_urlname', page);
  if (articles.length === 0 && page > 1) notFound();
  return (
    <main>
      <h1>ブログ</h1>
      <NoteArticleList articles={articles} />
      <NotePagination page={page} isLastPage={isLastPage} totalCount={totalCount} getHref={(p) => `/blog?page=${p}`} />
    </main>
  );
}
```

記事のリンク先は、既定では note の記事ページです。自分のサイトの詳細ページにしたい場合は `getHref` と `linkComponent={Link}` を渡します（下の「4. 詳細ページを作る」）。

### 4. 詳細ページを作る（任意）

`app/articles/[key]/page.tsx` を作ります。`note-blog-kit/next` のヘルパーで、静的生成するキーと metadata を作れます。

```tsx
import { generateNoteMetadata, generateNoteStaticParams } from 'note-blog-kit/next';
import { NoteArticleBody } from 'note-blog-kit/react';
import { getArticle, isNoteError } from 'note-blog-kit/server';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';

const USER = 'your_urlname';
type Props = { params: Promise<{ key: string }> };

// 自分の記事のキー（新しい順に 20 ページ分 = 120件。maxPages で変更できる）を1時間キャッシュする
const loadParams = unstable_cache(() => generateNoteStaticParams({ user: USER }), ['note-params', USER], {
  revalidate: 3600,
});

// 記事を1時間キャッシュする（generateMetadata とページで同じ記事を2回取得しない）。
// user にない著者の記事は NoteNotFoundError になるので、他人の記事は表示されない
const loadArticle = unstable_cache((key: string) => getArticle({ key, user: USER }), ['note-article', USER], {
  revalidate: 3600,
});

async function findArticle(key: string) {
  // URL のキーは外部から自由に指定されるので、自分の記事の一覧にないキーは note に問い合わせずに 404 にする
  if (!(await loadParams()).some((params) => params.key === key)) notFound();
  const article = await loadArticle(key).catch((error: unknown) => {
    // 見つからない記事だけ 404 にする（タイムアウトなどは 404 にしない）
    if (isNoteError(error) && error.code === 'NOTE_NOT_FOUND') return null;
    throw error;
  });
  if (article === null) notFound();
  return article;
}

// ビルド時に自分の記事を生成する
export const generateStaticParams = loadParams;

export async function generateMetadata({ params }: Props) {
  // canonical は既定で note の元 URL。自分のサイトを正にするなら { canonical: '...' } を渡す
  return generateNoteMetadata(await findArticle((await params).key));
}

export default async function ArticlePage({ params }: Props) {
  const article = await findArticle((await params).key);
  return (
    <main>
      <h1>{article.title}</h1>
      <NoteArticleBody article={article} />
    </main>
  );
}
```

- **著者の指定（`user`）**：`getArticle` は `user` に指定した著者の記事だけを返します（ほかの著者の記事は `NOTE_NOT_FOUND`）。複数の著者で運用するサイトでは `user: ['alice', 'bob']` のように配列で指定します
- **一覧にあるキーだけ取得する**：上の例は、自分の記事の一覧（`generateNoteStaticParams` の結果）にないキーを note に問い合わせずに 404 にします。そのため `maxPages`（既定 20 ページ）より古い記事も 404 になります。古い記事も表示したい場合は、`maxPages` を増やすか、一覧の確認を外してください。外した場合も `user` で他人の記事は表示されませんが、形式が正しい任意のキーで note に問い合わせが起きます。また、形式の正しくないキー（`ABC` など）は `getArticle` に渡すと `TypeError` になるので、先に `if (!isNoteArticleKey(key)) notFound()` で 404 にしてください（`isNoteArticleKey` は `note-blog-kit/server` から import します）
- **`generateNoteStaticParams`**：`listAllArticles` で記事を集めます。`param` で動的セグメントの名前（既定 `'key'`）を変えられます。`source: 'rss'`（または `'auto'` で RSS に切り替わったとき）は、RSS にある最新25件だけになります
- **`generateNoteMetadata`**：`title`・`description`（抜粋）・`alternates.canonical`・Open Graph・Twitter カードを返します。Next.js の `Metadata` にそのまま代入できます（`note-blog-kit` は `next` に依存しません）。`formatTitle` でタイトルを加工できます

### キャッシュの推奨

- `listArticles` は呼ぶたびに note へリクエストします。**呼び出しの結果ごとキャッシュしてください**（Next.js なら上の例の `unstable_cache`、ほかの環境ではビルド時に JSON へ書き出すなど）
- 同じプロセス内の連続リクエストは、ライブラリが自動で1秒以上空けます。この待ちは `listArticles` を呼ぶたびに入るため、`fetch` 単位のキャッシュ（`next: { revalidate }`）だけでは、同時アクセスが多いとページの表示が遅れます
- **ページ番号に上限を設けてください**（上の例では100）。上限がないと、`?page=` を変えたアクセスでキャッシュに無いページを取りに行かせ続けられます
- 全件の取得（`listAllArticles`）は1ページ6件ずつ取りに行くため時間がかかります。ビルド時やキャッシュの更新時に行ってください

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

エラーは `isNoteError(error)` と `error.code` で判別します。

| `code` | 内容 | 主な項目 |
| --- | --- | --- |
| `NOTE_NOT_FOUND` | 404、または `getArticle` の `user` にない著者の記事 | `url` |
| `NOTE_RATE_LIMITED` | リクエストが多すぎる（429）。時間を空けて再試行する | `url`・`retryAfterSeconds`（0〜86400 秒か null） |
| `NOTE_HTTP_ERROR` | その他の HTTP エラー | `url`・`status` |
| `NOTE_NETWORK_ERROR` | 通信の失敗 | `url` |
| `NOTE_TIMEOUT` | タイムアウト | `url` |
| `NOTE_SCHEMA_ERROR` | note のレスポンスの形が変わった、または本文が大きすぎる | `url`・`issues` |

コードはマイナーバージョンで増えることがあります。`switch` で分けるときは `default` を書いてください。エラーのコンストラクタは内部用です（利用者が作ることは想定していません）。オプションの誤り（不正な `user` や `timeoutMs` など）はプログラムの誤りとして `TypeError` を投げます。

結果は必ずキャッシュし、高頻度に呼び出さないでください（方法は上の「キャッシュの推奨」を参照）。

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

### RSS で取得する（API が使えないとき）

`listArticles`・`iterateArticles`・`listAllArticles` は `source` で取得元を選べます（既定は `'api'`）。

```ts
// RSS から取得する（最新25件・1ページのみ）
const { articles } = await listArticles({ user: 'your_urlname', source: 'rss' });

// API で取得し、失敗したら RSS に切り替える
const page = await listArticles({ user: 'your_urlname', source: 'auto' });
```

- `'rss'`：note の RSS から取得します。最新25件だけの1ページで（`isLastPage: true`、`totalCount: null`）、`hashtags` は空、`likeCount`・`price` は `null` です。`page` に 2 以上を渡すと `TypeError` になります
- `'auto'`：API で取得し、404・5xx・レスポンスの形の違い（`NOTE_SCHEMA_ERROR`）で失敗したら RSS に切り替えます。切り替えるのは1ページ目だけで、タイムアウト・通信の失敗・中断では切り替えません。どちらで取れたかは各記事の `source`（`'api'` / `'rss'`）で分かります
- 記事本文（`getArticle`）は RSS に切り替わりません（RSS に本文はありません）
- `listAllArticles`・`iterateArticles` を RSS で取得したときは1回で終わり、`truncated` は `false` になります。ただし RSS は最新25件だけなので、それより古い記事は含まれません（記事の `source` が `'rss'` かで判別してください）

### 記事1件を取得する（サーバー側）

```ts
import { getArticle } from 'note-blog-kit/server';

// key は記事 URL の /n/ の後ろ。user に指定した著者の記事だけを返す（ほかの著者の記事は NOTE_NOT_FOUND）
const article = await getArticle({ key: 'n55256baa5425', user: 'your_urlname' });

// 複数の著者で運用するサイトでは配列で指定する
const article2 = await getArticle({ key: 'n55256baa5425', user: ['alice', 'bob'] });

article.bodyHtml; // サニタイズ済みの本文 HTML（サニタイズは外せません）
article.isPartial; // 有料記事で本文が途中までのとき true（「続きは note で」を出す）
article.toc; // 目次（id は本文の見出しの id と同じ。有料記事では有料部分の見出しも含む）
article.embeds; // 本文中の埋め込み（本文の <figure data-nbk-embed-key> と key で対応）
```

`user` は必須です。note の API は記事キーだけで誰の記事でも返すため、他人の記事を表示しないよう、指定した著者（大文字小文字も含めて一致）の記事だけを返します。`key` は `n` と英小文字・数字だけを受け付け、それ以外や不正な `user` は送信せずに `TypeError` を投げます（`key` をページの URL から受け取った場合は、先に `isNoteArticleKey(key)` で確かめ、false なら 404 にしてください）。オプション（`fetch`・`signal`・`timeoutMs`・`minIntervalMs`）とエラーは `listArticles` と同じです。結果は必ずキャッシュしてください。

### ビルド時に JSON に書き出す（CLI）

サーバーを持たないサイト（Vite などの SPA、静的サイト）では、ビルドの前に記事を JSON に書き出し、その JSON を読んで表示します。

```bash
npx note-blog-kit sync --user your_urlname --out public/note
```

| 引数 | 内容 |
| --- | --- |
| `--user`（必須） | note のユーザー名 |
| `--out`（必須） | 出力先ディレクトリ（なければ作ります） |
| `--max-pages` | 一覧の最大ページ数（1ページ6件）。既定 `20` |
| `--no-body` | 本文を取得せず、一覧だけを書き出す |
| `--allow-empty` | 前回は記事があったのに今回の一覧が空でも書き出す（既定では何も変えずに終了コード `1`） |

出力されるファイル：

- `<out>/articles.json`：`{ version: 1, user, syncedAt, truncated, articles }`（型は `NoteSyncedArticleList`。`articles` は `NoteArticleSummary[]`、`truncated` は `--max-pages` で打ち切ったとき `true`）。`version` は形式のバージョンです。既存の項目の意味・型を変える、または項目を消すときだけ上げ、項目を足すだけなら 1 のままにします（読み手は知らない項目を無視してください）。`useNoteArticles` は `version: 1` と、`version` のない v0.3 までの `articles.json` を読み、知らない `version` は `error` にします
- `<out>/articles/<key>.json`：記事1件の `NoteArticle`（本文はサニタイズ済み）

型は `note-blog-kit` から import できます：`import type { NoteSyncedArticleList, NoteArticle } from 'note-blog-kit'`

注意：

- note への負荷を抑えるため、リクエストは1秒以上の間隔で1件ずつ送ります（間隔を短くする引数はありません）。120件なら、一覧と本文で約2分かかります
- 終了コードは、成功が `0`、取得の失敗（本文の一部を含む）が `1`、引数の誤りが `2` です。本文の取得に失敗した記事は書き出さず、ほかの記事と一覧は書き出します
- 著者が `--user` でない記事は、一覧にも本文にも書き出しません
- 前回書き出した本文のうち、今回の一覧にない記事（削除・非公開にした記事）と、本文が見つからなかった記事（404・著者の違い）の `<key>.json` は消します。消すのは記事キーの形のファイルだけです。`--no-body` のときは `articles/` に触れません
- 本文を一時的に取得できなかった記事（通信の失敗・タイムアウト・5xx・429）は、前回の `<key>.json` を残します（終了コードは `1`）。それ以外の失敗（404・ほかの 4xx・レスポンスの形の違い）では消します（有料化した記事の全文や、古いバージョンでサニタイズした本文を残し続けないため）
- note の一時的な障害で空の一覧が返ったときに前回の出力を消さないよう、前回の出力に記事があり（`articles.json` か `articles/` の本文）今回の一覧が空なら、何も書き換えずに終了コード `1` で終わります。記事をすべて削除・非公開にした場合は `--allow-empty` を付けてください
- `<out>/articles` がシンボリックリンクなら、何も書き出さずに終了コード `1` で終わります（取得の途中で差し替えられた場合も、書き出しと削除を止めます）。確かめるのは `<out>/articles` だけで、`--out` に指定したディレクトリ自体はシンボリックリンクでもかまいません
- 書き出した JSON は、自分のサイトのリポジトリにコミットするか、ビルドのたびに作り直してください

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

### 本文を表示する（React）

`NoteArticleBody` は `getArticle` で取得した記事の本文を描画します。`dangerouslySetInnerHTML` は使わず、サニタイズ済みの本文を、許可したタグ・属性だけの React 要素にします。有料記事（`isPartial`）では、本文の後に「続きは note で」リンクを出します。

```tsx
import { getArticle } from 'note-blog-kit/server';
import { NoteArticleBody } from 'note-blog-kit/react';

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  // 実際には上の「4. 詳細ページを作る」のように、キャッシュと 404 の扱いを加える
  const article = await getArticle({ key: (await params).key, user: 'your_urlname' });
  return (
    <article>
      <h1>{article.title}</h1>
      <NoteArticleBody
        article={article}
        components={{
          // 画像・見出し・埋め込み・目次を任意のコンポーネントに置き換えられる
          img: ({ src, alt, width, height }) => <img src={src} alt={alt} width={width} height={height} />,
        }}
        labels={{ readMore: '続きを note で読む' }}
      />
    </article>
  );
}
```

| props | 内容 |
| --- | --- |
| `article`（必須） | `getArticle` の戻り値 |
| `components` | `img`（`src`・`alt`・`width`・`height`）、`heading`（`level`: 2〜4・`id`・`children`）、`embed`（`embed`: `NoteEmbed \| null`・`service`・`children`）、`toc`（`items`）を置き換える |
| `readMoreHref` | 「続きは note で」のリンク先。既定は記事 URL（http(s) でなければ出さない） |
| `linkComponent` | 「続きは note で」と note の埋め込みのリンクに使う要素。既定は `'a'` |
| `labels` | `readMore`（既定「続きは note で」）、`toc`（既定「目次」） |

- **既定の描画**：外部記事の埋め込みは中のリンクカード、note の埋め込みは記事へのリンクを出します（`iframe` は出しません）。目次の位置には `article.toc` を出し、本文にない見出し（有料部分）はリンクにしません
- **クラス名**：
  - `nbk-body`（`__more`・`__more-link`）
  - 本文の要素：`nbk-body__p`・`__h2`・`__h3`・`__h4`・`__a`・`__ul`・`__ol`・`__blockquote`・`__figure`・`__figcaption`・`__img`・`__pre`・`__code`・`__hr`・`__table`・`__th`・`__td`。`li`・`strong`・`em` などにはクラスを付けません。`components` で置き換えた画像・見出しにも付きません
  - `nbk-toc`（`__title`・`__list`・`__item`・`__item--h2`/`--h3`・`__link`）
  - `nbk-embed`（`data-service` 属性）。埋め込みの中のリンクは `nbk-body__a` ではなく `nbk-embed__link` になります
- **他人の記事**：`getArticle` は `user` に指定した著者の記事だけを返すので、URL から受け取ったキーでも他人の記事は表示されません

### SPA で一覧を表示する（Vite など）

ブラウザから note へは直接アクセスできません（note は CORS に対応していません）。SPA では、次のどちらかから取得します。

1. **CLI `sync` が書き出した JSON**（サーバー不要）：ビルドの前に `note-blog-kit sync --user your_urlname --out public/note --no-body` を実行し、`/note/articles.json` を読みます
2. **中継エンドポイント**（サーバーがある場合）：`note-blog-kit/next` の `createNoteArticlesHandler` で Route Handler を作ります

```tsx
import { NoteArticleList, useNoteArticles } from 'note-blog-kit/react';

export function Blog() {
  const { articles, isLoading, error } = useNoteArticles({ url: '/note/articles.json' }); // または '/api/note?page=1'
  if (isLoading) return <p>読み込み中…</p>;
  if (error) return <p>記事を読み込めませんでした</p>;
  return <NoteArticleList articles={articles} />;
}
```

```ts
// app/api/note/route.ts（Next.js App Router の中継エンドポイント）
import { createNoteArticlesHandler } from 'note-blog-kit/next';

export const GET = createNoteArticlesHandler({ user: 'your_urlname' });
```

- **`useNoteArticles`**：`url` から `{ articles, page, isLoading, error }` を返すクライアント用のフックです。中継エンドポイントの `NoteArticlePage` と、`sync` の `articles.json`（1ページとして扱います。知らない `version` は `error`）のどちらも読めます
  - note.com の URL を渡すと取得せずに `error` を返します。`url` が変わると取り直し、古い応答は捨てます
  - 応答の検証は最小限です（主な項目の型が合わない記事は除きます）。`url` には自分のサイトの中継エンドポイントか JSON を指定し、利用者の入力を使わないでください
  - `fetch` を渡す場合は、描画ごとに作り直しても取り直しは起きません（`url` が変わったときだけ取り直します）
- **`createNoteArticlesHandler`**：`?page=N` の一覧を JSON で返します
  - `page` は 1〜`maxPageNumber`（既定 100、`source: 'rss'` では 1）の正規形の整数だけを受け付けます。`01`・`1.0` などの別の書き方や、`page` 以外のクエリは 400 です（CDN のキャッシュを外して note へのリクエストを増やされないように）
  - 成功した応答には `Cache-Control: public, s-maxage=3600, stale-while-revalidate=3600` を付けます（秒数は `cacheSeconds` で変更）
  - 失敗したときは `{ "error": "<コード>" }` を返し、キャッシュさせません：400 `INVALID_REQUEST`／404 `NOTE_NOT_FOUND`／502（そのほかの note のエラー）／500 `INTERNAL_ERROR`（本文の型は `NoteArticlesHandlerErrorBody`、コードの型は `NoteArticlesHandlerErrorCode`。`note-blog-kit` と `note-blog-kit/next` から import できます。コードはマイナーバージョンで増えることがあります）
  - オプション（`source` など）は `listArticles` と同じです（`page` は指定できません）。リクエストが中断されると、note への取得も中断します
- `note-blog-kit/react` のほかのコンポーネントは、これまでどおり Server Component としても使えます。`useNoteArticles` だけは Client Component（`'use client'` のファイル）か SPA で使ってください

動く例は [`examples/vite`](examples/vite) にあります。

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
| `--nbk-body-max-width` | `620px` | 本文の最大幅 |
| `--nbk-body-font-size` / `--nbk-body-line-height` | `18px` / `2` | 本文の文字サイズ・行間（note に合わせた値） |
| `--nbk-body-gap` | `1.5em` | 本文の段落などの間隔 |
| `--nbk-color-subtle` | `#f5f8fa` | コードブロック・目次の背景 |
| `--nbk-color-button-bg` / `--nbk-color-button-text` | `#08131a` / `#fff` | 「続きは note で」ボタン |

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
# 既定は fixtures/ の保存済みレスポンスで動く（note にアクセスしない）
pnpm -C examples/next dev
```

```bash
# 実際の note から取得する（NOTE_BLOG_KIT_LIVE=1 と、自分の urlname の NOTE_USER を両方指定したときだけ）
NOTE_BLOG_KIT_LIVE=1 NOTE_USER=your_urlname pnpm -C examples/next dev
```

CI は `pnpm build:examples` で、一覧ページが30行以内であること、fixture モードでのビルド、起動したページの表示（一覧が出る・範囲外が 404 になる・詳細ページに本文と canonical が出る・fixture にない記事が 404 になる）を確認しています。fixture にある記事本文は2件だけなので、自分の全記事が崩れず表示できるかは、実際の note から取得するモードで `/articles/{記事キー}` を開いて目で確かめてください。

### examples/vite を動かす

```bash
# fixtures/ から public/note/articles.json を作る（note にアクセスしない）
pnpm -C examples/vite sync:fixture
pnpm -C examples/vite dev
```

```bash
# 実際の note から書き出す場合（ルートで pnpm build をしてから）
node packages/note-blog-kit/dist/cli/index.js sync --user your_urlname --out examples/vite/public/note --no-body
```

CI は `pnpm build:examples` で、fixture から JSON を作ってビルドし、ブラウザ向けのバンドルにサーバー専用のコード（zod・sanitize-html・note の API の URL）が入っていないことを確認しています。

### 契約テスト（note の形の変化に気づく）

GitHub Actions が毎日1回、自分のアカウントの公開情報を3リクエストだけ取得し、note の API・RSS の形が変わっていないか確かめます。変わっていたら Issue を作り、人が `claude-fix` ラベルを付けると Claude Code が修正します。詳しくは [docs/contract-test.md](docs/contract-test.md) を参照してください。

### README を変えたとき

npm に載る `packages/note-blog-kit/README.md` は、このファイルから `pnpm readme:sync` で作ります（「開発」の節を除き、リンクを GitHub の URL にします）。食い違うとテストが失敗します。

## ライセンス

MIT
