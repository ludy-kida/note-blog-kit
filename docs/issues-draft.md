# Phase 2〜4 の Issue 下書き

**起票済み（2026-11-12）**：GitHub Issue #2〜#15。下書きの #N は GitHub の #(N+1) に対応する。以後は GitHub Issue を正とし、このファイルは更新しない。

人が受け入れ条件を確認・修正してから GitHub Issue にする。1 Issue = 1 PR、差分 300 行前後が目安。
「依存」欄の新しい依存は、その Issue の計画承認時にあわせて承認する。

設計上の前提：zod と sanitize-html は `/server` だけが使う。そのため正規化（zod）は `src/server/normalize/` に置き、core（`.`）は型と依存のない小さな関数だけにする（計画の「zod は /server だけ」に合わせる）。

---

## Phase 2：一覧表示 → v0.1.0

### #1 v2 contents の正規化（zod）

- 依存：`zod`
- 内容：`/api/v2/creators/{user}/contents` のレスポンスを zod で検証し、`NoteArticlePage` に変換する（内部関数。公開は #2）
- 受け入れ条件
  - [ ] `fixtures/contents/page-{1,2,3}.json` の18件すべてが `NoteArticleSummary` に変換できる
  - [ ] `hashtags` は `#` を除いた文字列の配列、`publishedAt` は ISO 8601、`source` は `'api'`
  - [ ] `excerpt` は `body` の前後の空白を除いたもの。有料記事（`"\n"`）は空文字
  - [ ] `price` は有料記事で 980、無料記事で 0。`likeCount`・`eyecatchUrl`・`author` が fixture の値と一致する
  - [ ] `isLastPage`・`totalCount` が反映される
  - [ ] スキーマは使うキーだけを検証し、未知のキーが増えても失敗しない
  - [ ] 使うキーが欠けた・型が違うときは `NoteSchemaError`（どのパスが不正かを含む）になる
  - [ ] fixture にないキーを使っていない

### #2 `listArticles` と型付きエラー・取得間隔の制限

- 依存：なし
- 内容：`note-blog-kit/server` から `listArticles({ user, page })` を公開する
- 受け入れ条件
  - [ ] `fetch` を差し替えられ（オプション）、テストは fixture を返すモックで動く。実 API にはアクセスしない
  - [ ] 404 は `NoteNotFoundError`、その他の非 2xx は `NoteHttpError`（status を持つ）、タイムアウトは `NoteTimeoutError`。すべて `NoteError` を継承する
  - [ ] 同じプロセス内の連続リクエストは最低 1 秒（変更可）の間隔を空ける。テストは偽のタイマーで確認する
  - [ ] Cookie・認証ヘッダーを送らない
  - [ ] 公開 API の型テスト（`*.test-d.ts`）と api-extractor のレポートがある

### #3 `iterateArticles` / `listAllArticles`（ページ数の上限つき）

- 依存：なし
- 受け入れ条件
  - [ ] `iterateArticles({ user, maxPages })` が `isLastPage` まで順に記事を返す（AsyncIterable）
  - [ ] `maxPages` の既定値は 20（120件）。超えたら止まり、続きがあることを呼び出し側が判別できる（案：`listAllArticles` の戻り値に `truncated: boolean`）
  - [ ] `maxPages` を引数で変えられる（決定事項）
  - [ ] 途中のページで失敗したら、そのエラーを投げる

### #4 React：`NoteArticleList`・`NoteArticleCard`・`NotePagination`

- 依存：`react`（peerDependencies、18/19）、開発用に `react`・`react-dom`・`@types/react`・`@testing-library/react`・`happy-dom`
- 受け入れ条件
  - [ ] データ（`NoteArticleSummary[]`・`NoteArticlePage`）を受け取って描画するだけで、取得しない
  - [ ] 見た目を持たない。安定したクラス名（`nbk-` 接頭辞）を付け、`className`・`renderItem`・リンク要素の差し替え（Next.js の `Link` など）ができる
  - [ ] `/react` に zod・sanitize-html が含まれない（size-limit とビルド結果で確認）。gzip 10KB 以下
  - [ ] Testing Library で表示と差し替えのテストがある

### #5 デフォルト CSS（note の見た目に合わせる）

- 依存：なし
- 受け入れ条件
  - [ ] `note-blog-kit/styles.css`（任意で import）を提供する
  - [ ] 一覧・カード・ページ送りの見た目を note に合わせる（決定事項）
  - [ ] 色・フォント・余白・角丸を CSS 変数（`--nbk-*`）で上書きでき、`@layer` で利用者の CSS が優先される
  - [ ] subpath exports・publint・arethetypeswrong が通る

### #6 `examples/next` の一覧ページと README の導入手順

- 依存：examples 内のみ `next`・`react`・`react-dom`
- 受け入れ条件
  - [ ] App Router の一覧ページが30行以内で書ける（成功指標）
  - [ ] fixture を使うモードでビルドが通り、CI でビルドする
  - [ ] README に導入手順（インストール、一覧ページ、キャッシュの推奨）がある

---

## Phase 3：本文表示 → v0.2.0

### #7 サニタイズの許可リストと XSS テスト（人の承認が先）

- 依存：`sanitize-html`（optional peer）
- 進め方：**許可するタグ・属性の一覧と XSS テストケースを先に PR にし、人が承認してから実装する**
- 受け入れ条件
  - [ ] fixture の本文で使われているタグ（p, br, h2, h3, strong, em, a, ul, ol, li, blockquote, figure, figcaption, img, table-of-contents）を基に許可リストを決める
  - [ ] `script`・`on*` 属性・`javascript:` URL（大文字・空白・実体参照を含む）・`style`・`iframe` などがすべて無害化される
  - [ ] アフィリエイトリンクの `href`（クエリを含む）を壊さない。`target="_blank"` には `rel="noopener"` を付ける
  - [ ] サニタイズを外すオプションを作らない

### #8 `getArticle(key)`（v3 notes の正規化）

- 受け入れ条件
  - [ ] `fixtures/notes/*.json` を `NoteArticle` に変換できる。`bodyHtml` は必ずサニタイズ済み
  - [ ] 有料記事は `isPartial: true`、無料記事は `false`
  - [ ] `toc`（`index[]` から）、`embeds`（`embedded_contents[]` から）、`eyecatch`（幅・高さ・alt）が fixture と一致する
  - [ ] `note` 埋め込み（iframe）は本文に入れず、`embeds` から置き換えられる

### #9 React：`NoteArticleBody`（`components` で置き換え）と「続きは note で」

- 依存：`html-react-parser`
- 受け入れ条件
  - [ ] `components` で `img`・埋め込み（`note`・`external-article`）・見出しを任意のコンポーネントに置き換えられる
  - [ ] `isPartial` のとき「続きは note で」リンク（記事 URL）を表示する。文言を差し替えられる
  - [ ] 本文のデフォルト CSS を note の本文に合わせ、カスタム CSS で上書きできる（決定事項）
  - [ ] `/react` が gzip 10KB 以下のまま

### #10 `/next`：`generateNoteMetadata`・`generateNoteStaticParams`・詳細ページの例

- 受け入れ条件
  - [ ] canonical の既定値が note の元 URL
  - [ ] `generateNoteStaticParams` が `maxPages` の上限を守る
  - [ ] `examples/next` に詳細ページがあり、自分の全記事が崩れず表示できる（人が目視で確認）

---

## Phase 4：壊れにくさ → v0.3.0

### #11 RSS 取得と `source: 'api' | 'rss' | 'auto'`

- 依存：XML パーサー（候補を比較して提案。依存なしで済む方法も検討）
- 受け入れ条件
  - [ ] `fixtures/rss/feed.xml` の25件が `NoteArticleSummary`（`source: 'rss'`、取れない項目は `null`）になる
  - [ ] `auto` で API が失敗（404・5xx・スキーマエラー）したら RSS に切り替わる
  - [ ] RSS は1ページのみ（`isLastPage: true`、`totalCount: null`）

### #12 CLI `sync`（worktree で #11 と並行）

- 受け入れ条件
  - [ ] `note-blog-kit sync --user <name> --out <dir>` が一覧と本文を JSON に書き出す
  - [ ] `--max-pages` と取得間隔の制限を守る。引数は `node:util` の `parseArgs`

### #13 `useNoteArticles`・`/next` の中継 Route Handler・`examples/vite`

- 受け入れ条件
  - [ ] `useNoteArticles` は中継エンドポイントから取得する（ブラウザから note へ直接アクセスしない）
  - [ ] 中継 Route Handler はキャッシュヘッダーを付ける
  - [ ] `examples/vite` が CLI の JSON で動き、CI でビルドする

### #14 契約テスト（毎日1回）と自動修正の流れ

- 受け入れ条件
  - [ ] `.github/workflows/contract.yml` が毎日1回、数リクエスト以内で実 API・RSS を取得し、スキーマと照合する（頻度と件数は人が決める）
  - [ ] 失敗したら、消えたキー・型が変わったキーを本文に入れた Issue を自動で作る
  - [ ] `.github/workflows/claude.yml` で、その Issue から Claude Code が `fix-api-change` スキルで修正 PR を作る
