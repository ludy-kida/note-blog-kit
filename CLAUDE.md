# CLAUDE.md

> 初版ドラフト。人が内容を確認・修正して確定させる。

## 目的

自分の note 記事を、React + TypeScript のサイトに数十行でブログとして載せられる npm ライブラリ「note-blog-kit」（仮称）を作る。
対象は Next.js App Router と Vite + React SPA。v1.0 は 2027-01-24 公開予定。

実装・テスト・ドキュメントはエージェントが書き、人は仕様・レビュー・判断を担う。
人の関門は「実装計画の承認」と「PR のマージ」の2か所。作業の単位は 1 Issue = 1 PR、差分は 300 行前後を目安にする。

## やらないこと

- 記事の投稿・編集・削除など、ログインが必要な操作
- 有料部分の表示、その他アクセス制限を回避する機能（Cookie・認証情報を送らない）
- ブラウザから note への直接アクセス（note は CORS 非対応。取得はすべてサーバー側）
- コメント・スキの書き込み、他ユーザーの検索、他人の記事の転載
- Vue や Svelte 向けのコンポーネント

## 絶対に守ること

- **note.com に直接アクセスしない**（curl、WebFetch、テストからの fetch すべて）。
  実レスポンスが必要なら `fixtures/` を使う。足りなければ「何を取りたいか」を人に伝え、人が `scripts/record-fixtures.ts` を実行する。
  エージェントは `pnpm fixtures:plan --user <name>`（通信しない確認）だけ実行してよい。
- `npm publish` / `pnpm publish` / `changeset publish` をしない。公開は人が release PR をマージして行う。
- `git push --force` をしない。
- 新しい依存を追加しない。必要なら理由と代替案を添えて提案し、人の承認を待つ。
- 既存テストの削除や期待値の緩和をするときは、PR の説明に理由を必ず書く。
- サニタイズの許可リストと XSS テストは、人の承認なしに変更しない。

## 設計ルール

- パッケージは1つ。用途ごとに subpath exports を分ける：`note-blog-kit`（core：型・正規化）、`/server`（取得・RSS・サニタイズ）、`/react`（表示）、`/next`（Next.js ヘルパー）、CLI（`sync`）。
- 取得は `/server` だけで行う。`/react` はデータを受け取って描画するだけ。
- `/react` に zod や sanitize-html を入れない（ブラウザに送るサイズを増やさない。size-limit で `/react` は gzip 10KB 以下）。
- note の生 JSON を公開型に出さない。正規化レイヤー（zod）で自前の型に変換し、note 側の変更はそこに閉じ込める。
- **fixture にないキーを使わない**。型は `fixtures/` の実レスポンスから作る。推測でフィールドを足さない。
- 本文 HTML のサニタイズは外せない設計にする（許可リスト方式）。
- canonical は note の元 URL をデフォルトにする。
- 公開型は `docs/phase0-findings.md` の「5. 公開型の案」で確定済み。変える場合は人の承認を得る。
- 全件取得（`iterateArticles` など）には既定のページ数上限を設け、`maxPages` で変更できるようにする（1ページ6件固定のため）。
- デフォルト CSS は note の本文の見た目に合わせる。クラス名を安定させ、CSS 変数などで利用者が上書き・装飾できるようにする。

## よく使うコマンド

- `pnpm check` — lint・型・テスト（カバレッジ）・ビルド・サイズ・API レポート・配布物をまとめて確認（完了前に必ず通す）
- `pnpm lint` / `pnpm format` — Biome（`format` は自動修正）
- `pnpm typecheck` — tsc（scripts とライブラリ）
- `pnpm test` / `pnpm test:coverage` — Vitest（型のテスト `*.test-d.ts` を含む。core のカバレッジ下限 80%）
- `pnpm build` — tsup（ESM・CJS・型定義）
- `pnpm size` — size-limit（`/react` は gzip 10KB 以下）
- `pnpm api` — 公開 API レポート（`etc/*.api.md`）を更新。CI は `pnpm api:check` で差分を検出する
- `pnpm check:dist` — publint・arethetypeswrong
- `pnpm fixtures:plan --user <name>` — fixture 取得の送信予定を表示（通信しない）

hooks：編集のたびに Biome と型チェック（PostToolUse）、終了前に関連テスト（Stop）、note.com へのアクセスをブロック（PreToolUse）。
スキル：`implement-issue`、`fix-api-change`、`prepare-release`。サブエージェント：`security-reviewer`、`api-reviewer`。

## 完了の定義

- lint・型チェック・テスト・size-limit が通る
- 公開 API に変更があれば `etc/note-blog-kit.api.md` を更新し、PR に明記する
- changeset がある（ユーザーに影響のない変更を除く）
- 受け入れ条件を表すテストが先にあり、それが通っている

## 進め方

1. Issue の受け入れ条件を読み、Plan mode で実装計画を作って人の承認を待つ
2. テストを先に書く（受け入れ条件を表しているか人が確認する）
3. 実装する。CI の失敗はエージェントが直す
4. セルフレビュー（Phase 1 以降は `security-reviewer`・`api-reviewer` サブエージェント）
5. PR に変更の要約とテスト結果を書く

## 人が必ず判断すること

1. 公開 API の型と名前（api-extractor のレポートに差分が出た PR）
2. サニタイズの許可リストと XSS テストの変更
3. 新しい依存の追加
4. note.com への実アクセス（fixture の取得）と npm 公開
