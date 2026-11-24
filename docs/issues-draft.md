# Phase 2〜5 の Issue 下書き

**起票済み（2026-11-12）**：Phase 2〜4 は GitHub Issue #2〜#15。下書きの #N は GitHub の #(N+1) に対応する。以後は GitHub Issue を正とし、Phase 2〜4 の節は更新しない。

**起票済み（2026-11-24）**：Phase 5 は GitHub Issue #40〜#63（番号は GitHub と同じ）。受け入れ条件は GitHub Issue を正とする。

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

---

## Phase 5：v1.0 → 1.0.0（2027-01-24）

### 経緯

2026-11-24 に、プロジェクトの経緯を知らない4つのエージェントにレビューを依頼し、その結果を人が判断して起票した。観点は、利用者の体験（a11y を含む）、公開 API の安定性、セキュリティと壊れにくさ、運用とリリースの4つ。

### 人の判断（2026-11-24）

- **著者の指定**：`getArticle` で表示してよい著者を必須で指定する。複数の著者で運用するサイトでも使えるよう、`user: string | readonly string[]` で1人でも複数でも書ける（#40）。目的を「自分（または運営者が許可した著者）の note 記事」に広げる。複数の著者の記事を1つの一覧にまとめる機能は 1.0 以降（#63）
- **Node**：Node 22 は非対応にする。Node 24 以上（#49）
- **配布形式**：ESM のみ。CJS のビルドをやめる（#43）

### 進め方

| 段階 | 期限 | Issue | リリース |
| --- | --- | --- | --- |
| 5a | 12/15 | API の凍結に必要な破壊的変更と、セキュリティの必須項目 | 0.4.0 |
| 5b | 1/10 | 壊れにくさ・ドキュメント・CI・方針の文書 | 1.0.0-rc.1（dist-tag `next`） |
| 5c | 1/24 | RC で見つかった問題の修正だけ | 1.0.0 |

「★人」は、公開 API・サニタイズ・依存・対応範囲・fixture の取得のように、人の判断が要る Issue。

### 5a：API の凍結とセキュリティの必須項目（v1.0 必須）

- #40 `getArticle` で表示してよい著者を必須で指定する（1人でも複数でもよい） ★人
- #41 エラーモデルを API の凍結に備えて整理する ★人
- #42 `useNoteArticles` の戻り値を見直す ★人
- #43 ESM のみの配布にし、凍結前に名前を整理する ★人
- #44 `articles.json` に形式のバージョンを入れて型を公開し、中継エンドポイントのエラーコードを型にする ★人
- #45 サニタイズの前に本文の大きさの上限を設ける（処理時間が入力長の2乗で増える件。再現済み） ★人
- #46 CLI `sync` を失敗に強くする（空の一覧や一時エラーで前回の出力を消さない。再現済み）
- #47 許可リストを1か所にまとめて CODEOWNERS で守り、本文の空のリンクをなくす ★人
- #48 claude.yml を、作成者が信頼できる Issue のときだけ動かす

### 5b：壊れにくさ・ドキュメント・CI・方針の文書

v1.0 必須：
- #49 互換性ポリシー・サポート期間・0.x からの移行ガイドを書く（Node 24 以上にする） ★人
- #50 CI に Node・React・Next の対応範囲のマトリクスと、配布物の動作確認を追加する
- #51 README を v1.0 向けに更新する
- #52 SECURITY.md・CONTRIBUTING.md・Issue テンプレートを用意する

v1.0 推奨：
- #53 中継エンドポイントで note への負荷が増えないようにする（再現済み）
- #54 デフォルト CSS とコンポーネントのアクセシビリティを改善する
- #55 TSDoc をすべての公開シンボルに付ける
- #56 カバレッジの下限をリスクの高いコードに付け替え、公開型の型テストを広げる ★人
- #57 公開の前に検証し、1.0 の RC の手順を書く
- #58 fixture と契約テストの対象を広げる ★人（取得は人が行う）
- #59 SPA で記事一覧と詳細ページを作る例を用意する
- #60 規約の確認記録と、非公式 API の利用方針を書く ★人

### 後回し可（1.0 以降でもよい）

- #61 応答をストリームで読んで上限で中断し、記事 URL のホストを note.com に限る
- #62 CLAUDE.md・サブエージェント・hook を現在のコードに合わせる ★人
- #63 複数の著者の記事を、まとめて1つの一覧にする ★人
