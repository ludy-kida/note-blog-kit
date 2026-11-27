# 0.3 から 1.0 への移行

0.3 から 1.0 までの破壊的変更と、移行のしかたです。互換性の方針は [docs/stability.md](docs/stability.md) を参照してください。

> 1.0.0 の公開までに破壊的変更が入った場合は、ここに追記します。

## 動作環境

### Node.js 24 以上（0.5）

Node.js 22 は対応から外しました（2027-04-30 にサポートが終わるため）。Node.js 24 以上を使ってください。

### ES Modules のみ（0.4）

CJS のビルドをやめました。

- ES Modules のプロジェクト（`"type": "module"`、Next.js、Vite）では変更は要りません
- CommonJS のプロジェクトからも、`require('note-blog-kit/server')` のように読み込めます（Node.js の require(esm)）
- TypeScript の CommonJS のプロジェクトでは、`moduleResolution` を `nodenext`（TypeScript 5.8 以上）か `bundler` にしてください

## note-blog-kit/server

### `getArticle` の `user` が必須（0.4）

指定した著者の記事だけを返します。ほかの著者の記事は `NoteNotFoundError`（`NOTE_NOT_FOUND`）になります。

```ts
// 0.3
const article = await getArticle({ key });
if (article.author.urlname !== 'your_urlname') notFound();

// 1.0
const article = await getArticle({ key, user: 'your_urlname' });
// 複数の著者で運用するサイトでは配列で指定する
const article2 = await getArticle({ key, user: ['alice', 'bob'] });
```

著者を手で確かめていた処理は消してください。

### エラーモデル（0.4）

- **HTTP 429** は `NOTE_HTTP_ERROR` ではなく `NOTE_RATE_LIMITED`（`NoteRateLimitError`）になりました。`retryAfterSeconds` で `Retry-After` の秒数（なければ `null`）を読めます
- `NoteNetworkError`・`NoteTimeoutError` に `url`（`string`）、`NoteSchemaError` に `url`（`string | null`）が加わりました
- エラーのコンストラクタを内部用にし、`NoteErrorOptions` の export をやめました。テストでエラーを作っていた場合は、モックの `fetch` が該当する応答を返す形にしてください
- `NoteErrorCode` はマイナーバージョンで増えることがあります。`switch` には `default` を書いてください

```ts
// 0.3
if (isNoteError(error) && error.code === 'NOTE_HTTP_ERROR' && error.status === 429) { /* 待つ */ }

// 1.0
if (isNoteError(error) && error.code === 'NOTE_RATE_LIMITED') {
  const seconds = error.retryAfterSeconds ?? 60;
}
```

### `NoteArticlePage` に `source` が加わった（0.4）

`listArticles` などが返すページに、実際の取得元 `source`（`'api'` | `'rss'`）が入ります。`source: 'auto'` で RSS に切り替わったページは `'rss'` です。`NoteArticlePage` を自分で作っている場合（テストのデータなど）は `source` を足してください。

## note-blog-kit/next

### `createNoteArticlesHandler` の `maxPageNumber` を `maxPage` に改名（0.4）

古い名前を渡すと `TypeError` になります。

```ts
// 0.3
export const GET = createNoteArticlesHandler({ user: 'your_urlname', maxPageNumber: 20 });

// 1.0
export const GET = createNoteArticlesHandler({ user: 'your_urlname', maxPage: 20 });
```

## note-blog-kit/react

### `useNoteArticles` の `page` を `data` に改名、`error` の型（0.4）

```ts
// 0.3
const { articles, page, error } = useNoteArticles({ url: '/api/note' });
const current = page?.page;

// 1.0
const { articles, data, error } = useNoteArticles({ url: '/api/note' });
const current = data?.page;
if (error?.code === 'NOTE_RATE_LIMITED') { /* 中継エンドポイントのエラーコード */ }
```

- `error` は `UseNoteArticlesError`（`Error` を継承）になり、`status`（HTTP ステータス）と `code`（中継エンドポイントのエラーコード）を読めます
- 結果オブジェクトを自分で作っている場合（テストのモックなど）は、`page` を `data` にし、`error` の型を `UseNoteArticlesError` にしてください

### `NoteArticleList` の `empty` を `labels.empty` に移動（0.4）

```tsx
// 0.3
<NoteArticleList articles={articles} empty="まだ記事がありません" />

// 1.0
<NoteArticleList articles={articles} labels={{ empty: 'まだ記事がありません' }} />
```

## CLI `sync`

### `articles.json` に `version` が加わった（0.4）

`articles.json` に形式のバージョン（`version: 1`）が入ります。`useNoteArticles` は `version` のない 0.3 までのファイルも読めます。`articles.json` を自分で読んでいる場合は、型 `NoteSyncedArticleList`（`note-blog-kit` から import）を使えます。

### 失敗への強さ（0.4）

前回の出力に記事があるのに、今回の一覧が空だった場合は、何も書き換えずに終了コード 1 で終わります。空にしてよい場合は `--allow-empty` を付けてください。
