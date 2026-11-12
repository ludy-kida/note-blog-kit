---
name: implement-issue
description: GitHub Issue を1つ受け取り、計画→テスト→実装→セルフレビュー→PR まで進める手順。「Issue #N を実装して」と頼まれたときに使う。
---

# implement-issue

1 Issue = 1 PR、差分は 300 行前後を目安にする。大きければ Issue の分割を提案して止まる。

## 1. 読む

- Issue の本文と受け入れ条件を読む（GitHub MCP の `issue_read`）
- CLAUDE.md、docs/phase0-findings.md（公開型・fixture の構造）、関連するソースとテストを読む
- 使う note のキーが `fixtures/` に実在するか確認する。なければ実装せず、人に「何を取得したいか」を伝える

## 2. 計画（人の関門 1）

Plan mode で次を書いて人の承認を待つ。承認前にコードを書かない。

- 変更するファイルと公開 API（追加・変更する型・関数のシグネチャ）
- 受け入れ条件ごとのテストケース
- 新しい依存が必要なら、理由と代替案（承認制）
- 人の判断が必要な点（公開 API、サニタイズ、依存）

## 3. テストを先に書く

- 受け入れ条件を表すテストを書き、失敗することを確認する（`pnpm test`）
- 入力は `fixtures/` の実レスポンスを使う。note.com にはアクセスしない
- 公開型は `*.test-d.ts` で `expectTypeOf` を使う
- サニタイズ・XSS のテストを変える場合は、変更内容を人に見せて承認を得てから

## 4. 実装する

- hooks が編集のたびに Biome と型チェックを実行する。指摘はその場で直す
- 設計ルール（CLAUDE.md）を守る：取得は `/server`、`/react` に zod・sanitize-html を入れない、生 JSON を公開型に出さない
- 既存テストの削除や期待値の緩和はしない。必要なら理由を PR に書く

## 5. 確認する

- `pnpm check` を通す（lint・型・テスト・カバレッジ・ビルド・サイズ・API レポート・配布物）
- 公開 API が変わったら `pnpm api` で etc/ を更新する
- ユーザーに影響する変更なら changeset を追加する：`.changeset/<短い名前>.md` に

  ```md
  ---
  'note-blog-kit': patch
  ---

  変更内容（利用者向けに1〜2行）
  ```

  0.x の間は、破壊的変更と機能追加は minor、修正は patch

## 6. セルフレビュー

- 公開 API に触れたら `api-reviewer` サブエージェント
- 本文 HTML・サニタイズ・URL・取得経路に触れたら `security-reviewer` サブエージェント
- 指摘を直すか、直さない理由を PR に書く

## 7. PR を作る（人の関門 2）

- `.github/pull_request_template.md` の見出しに沿って、変更の要約・受け入れ条件とテスト・`pnpm check` の結果・人の判断が必要な変更を書く
- 本文に `Closes #N` を入れる
- CI が落ちたら自分で直す。マージは人が行う
