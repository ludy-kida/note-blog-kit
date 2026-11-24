# 契約テストと修正の流れ

note の API は公式に公開されたものではなく、形が予告なく変わることがあります（v0.2.0 の前にも、一覧 API の `eyecatch` が `null` になる記事が見つかりました）。
利用者のサイトで `NoteSchemaError` が出る前に気づけるよう、実データとの照合を毎日行い、修正までの流れを用意しています。

## 何をいつ取得するか

- ワークフロー：[`.github/workflows/contract.yml`](../.github/workflows/contract.yml)
- いつ：毎日 12:17（日本時間）と、Actions の画面から手動で実行したとき（`workflow_dispatch`）
- 取得するもの：自分のアカウント（`kida_lw`）の公開情報を3リクエストまで
  1. 一覧 API の1ページ目
  2. 記事本文 API を1件（一覧の1ページ目のうち、先頭の無料記事）
  3. RSS
- 取得のしかた：ビルドしたライブラリの `listArticles`・`getArticle` を使う。Cookie・認証情報は送らない。1秒間隔で、再試行しない
- 照合：ライブラリの正規化（zod）を通るかを見る。照合の処理は [`scripts/lib/contract.ts`](../scripts/lib/contract.ts)、実行するのは [`scripts/contract-check.ts`](../scripts/contract-check.ts)

エージェント（Claude Code）は手元でも CI でも `scripts/contract-check.ts` を実行しません。note.com にアクセスするためです（PreToolUse hook で止めています）。
照合の処理は、fixture を返すモックで `scripts/lib/contract.test.ts` がテストしています。

## 結果と終了コード

| 終了コード | 意味 | ワークフローの動き |
| --- | --- | --- |
| 0 | 問題なし | 成功 |
| 1 | 形の変化（zod の検証エラー・404・404 以外の 4xx・想定外の例外） | `contract-failure` ラベルの Issue を作る（開いていればコメントを追記）。ジョブは失敗 |
| 2 | 一時的な失敗だけ（5xx・429・通信の失敗・タイムアウト） | Issue は作らない。ジョブは失敗（翌日また確かめる） |

結果の表は Actions の Summary と Issue に出ます。載せるのは確認の名前・エラーコード・HTTP ステータス・zod の `path` と `message` だけで、応答の中身（本文・URL）は載せません。
`path` は note の応答のキー名を含みうるので、コードブロックの中に置いています。

## Issue を受け取ったら

1. Issue の `path` を見て、消えたキー・型が変わったキーを確かめる（例：`data.contents.0.eyecatch: Invalid input: expected string, received null`）
2. 新しい応答が必要なら、fixture を取り直す（人が端末で実行する。手順は [fixtures/README.md](../fixtures/README.md)）
3. Issue に `claude-fix` ラベルを付ける。Claude Code が [`fix-api-change`](../.claude/skills/fix-api-change/SKILL.md) スキルの手順で修正し、ブランチに push して PR 作成リンクを Issue にコメントする
4. PR を作り、レビューしてマージする。note 側への追従は patch リリース

Claude Code は次のことをしません：note.com へのアクセス、公開型の変更（必要なら案をコメントして止まる）、新しい依存の追加、サニタイズの許可リスト・XSS テストの変更、PR のマージ、npm への公開。

Issue や PR のコメントで、オーナー・メンバー・コラボレーターが `@claude` と書いたときも Claude Code が動きます（[`.github/workflows/claude.yml`](../.github/workflows/claude.yml)）。

## 人が行う設定

1. **Claude Code の認証情報を Secrets に登録する**（Settings → Secrets and variables → Actions）。どちらか一方でよい
   - `CLAUDE_CODE_OAUTH_TOKEN`：Claude のサブスクリプションを使う場合。手元で `claude setup-token` を実行して作る
   - `ANTHROPIC_API_KEY`：API キーを使う場合
2. **Claude の GitHub App をリポジトリに入れる**（https://github.com/apps/claude）。手元の Claude Code で `/install-github-app` を実行しても設定できる
3. **ラベル**：`contract-failure` と `claude-fix` は、契約テストが初めて Issue を作るときに自動で作られる。先に作っておいてもよい
4. **初回の確認**：Actions の「Contract」を手動で実行し（Run workflow）、3つとも成功することを確かめる

## 実データへのアクセスについて

このワークフローが note.com にアクセスするのは、人が判断した範囲（自分のアカウントの公開情報・1日1回・3リクエスト）だけです。
取得する対象や回数を増やすときは、このファイルとワークフローを人が変更します。
