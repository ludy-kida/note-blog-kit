# note-blog-kit

自分の note 記事を、React + TypeScript のサイトに数十行でブログとして載せるためのライブラリ（開発中・仮称）。

## 注意事項

- note の**非公式 API** を利用しており、予告なく動かなくなる可能性があります
- note 株式会社とは無関係のライブラリです
- **自分の記事**を表示する用途を想定しています（他人の記事の転載はしないでください）
- キャッシュを有効にし、高頻度なアクセスはしないでください
- canonical は note の元 URL を推奨します
- 有料部分は表示しません

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

## 開発状況

Phase 0（調査と検証）。fixture の取得手順は [fixtures/README.md](fixtures/README.md)、エージェント向けのルールは [CLAUDE.md](CLAUDE.md) を参照。

## ライセンス

MIT
