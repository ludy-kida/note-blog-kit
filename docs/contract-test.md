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
| 4 | スクリプト自体の失敗（ビルド済みのライブラリが読めないなど） | Issue は作らない。ジョブは失敗（ログを見る） |

結果の表は Actions の Summary と Issue に出ます。載せるのは確認の名前・エラーコード・HTTP ステータス・zod の `path` と `message` だけで、応答の中身（本文・URL）は載せません。
`path` は note の応答のキー名を含みうるので、コードブロックの中に置いています。

## Issue を受け取ったら

1. Issue の `path` を見て、消えたキー・型が変わったキーを確かめる（例：`data.contents.0.eyecatch: Invalid input: expected string, received null`）
2. 新しい応答が必要なら、fixture を取り直す（人が端末で実行する。手順は [fixtures/README.md](../fixtures/README.md)）
3. Issue に `claude-fix` ラベルを付ける。Claude Code が [`fix-api-change`](../.claude/skills/fix-api-change/SKILL.md) スキルの手順で修正し、ブランチに push して PR 作成リンクを Issue にコメントする。Claude Code はテストを実行できない（下記）ので、テストは PR の CI で確かめる
4. PR を作り、CI が通ることを確かめ、レビューしてマージする。note 側への追従は patch リリース

Claude Code は次のことをしません：note.com へのアクセス、公開型の変更（必要なら案をコメントして止まる）、新しい依存の追加、サニタイズの許可リスト・XSS テストの変更、PR のマージ、npm への公開。

Claude Code が動くのは次のときだけです（[`.github/workflows/claude.yml`](../.github/workflows/claude.yml)）。

- 契約テスト（`github-actions[bot]`）が立てた `contract-failure` の Issue に、`claude-fix` ラベルが付いたとき（ラベルを付けた人に書き込み権限があることは action が確かめる）
- オーナーが立てた Issue か、契約テストの Issue（PR は除く）で、オーナーが `@claude` とコメントしたとき

外部の人が書いた本文やコメントで指示を差し込まれないよう、次のようにしています。

- Issue の作成者とコメントの作者の両方を確かめる。外部の人が立てた Issue では、オーナーが `@claude` と書いても動かない
- 依頼として読むコメントは、オーナーと bot のものだけ（`include_comments_by_actor`）
- 使えるのは、ワークスペース内のファイルの読み書き・検索、`git status`・`diff`・`log`、action が用意する commit・push（push 先はこの Issue 用のブランチに固定）だけ。`--permission-mode acceptEdits` にしているので、許可リストにないコマンドは拒否される（action の既定の auto モードは、審査を通れば許可リストの外のコマンドも実行するため使わない）
- **テスト・ビルド（`pnpm` など）は実行させない**。Claude Code はファイルを書けるので、テストの実行を許すと、自分で書いたテストの中で任意のコードを実行し、外部に通信できてしまうため。テストは人が PR を作ったあとの CI で確かめる
- WebFetch・WebSearch・`curl`・`wget`・`node`・`npx`・`pnpm`・`npm` と、`/proc` や `.git/config` の読み取りは明示的に禁止する
- 書き込みに使うのは、job の権限の範囲で job が終わると失効する `GITHUB_TOKEN`。`id-token` の権限は付けず、子プロセスの環境変数から API キーなどの秘密の値を消す（`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`）

リポジトリの `.claude/settings.json` の禁止ルールと hook は Actions の中でも読み込まれるはずですが、hook はコマンドの文字列で判定する補助なので、完全な防御ではありません。Claude Code が作った変更は、note へのアクセスが増えていないかも含めて人がレビューしてください（`scripts/contract-check.ts`・`scripts/lib/contract.ts` は CODEOWNERS の対象です）。

## 人が行う設定

1. **Claude Code の認証情報を Secrets に登録する**（Settings → Secrets and variables → Actions）。どちらか一方でよい
   - `CLAUDE_CODE_OAUTH_TOKEN`：Claude のサブスクリプションを使う場合。手元で `claude setup-token` を実行して作る
   - `ANTHROPIC_API_KEY`：API キーを使う場合
2. **Claude の GitHub App は不要**：書き込みには `GITHUB_TOKEN` を使う（コメントは github-actions の名前で付く）。以前に入れた App は、ほかに使っていなければ外してよい
3. **ラベル**：`contract-failure` と `claude-fix` は、契約テストが初めて Issue を作るときに自動で作られる。先に作っておいてもよい
4. **ブランチ保護**：main で「Require a pull request before merging」と「Require review from Code Owners」を有効にする（Claude Code が main に直接 push できないように）
5. **初回の確認**：Actions の「Contract」を手動で実行し（Run workflow）、3つとも成功することを確かめる
6. **Claude Code の起動条件の確認**：自分で立てた Issue に `@claude` とコメントすると Claude ジョブが動くこと、外部の人が立てた Issue では動かない（ジョブが skipped になる）ことを確かめる

## 実データへのアクセスについて

このワークフローが note.com にアクセスするのは、人が判断した範囲（自分のアカウントの公開情報・1日1回・3リクエスト）だけです。
取得する対象や回数を増やすときは、このファイルとワークフローを人が変更します。
