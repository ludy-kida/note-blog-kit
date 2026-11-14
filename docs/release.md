# リリースの手順

npm への公開は人が判断して行う（エージェントは公開しない）。公開は「リリース PR のマージ」で起きる。

## 仕組み

`.github/workflows/release.yml` が main への push のたびに Changesets を実行する。

1. **changeset がある**とき：バージョンと CHANGELOG を更新したリリース PR（`chore: release`、ブランチ `changeset-release/main`）を、GitHub App の名義で作成・更新する。App の名義なので、この PR でも CI が動く
2. **changeset がなく、未公開のバージョンがある**とき（＝リリース PR をマージした直後）：npm の trusted publishing（OIDC）で公開し、git タグと GitHub Release を作る。npm のトークンは使わない

公開できるのは main だけにする。ワークフローは GitHub Environment「release」で動き、Environment を main に制限したうえで、npm の trusted publisher と GitHub App の秘密鍵をこの Environment に結びつける。作業ブランチでワークフローを書き換えて push しても、npm への公開も秘密鍵の取得もできない。

## 初回だけ行う設定

### 1. GitHub Environment「release」を作る

1. リポジトリの **Settings → Environments → New environment** で、名前を `release` にして作る
2. **Deployment branches and tags** で **Selected branches and tags** を選び、**`main` だけ**を追加する
3. （任意）**Required reviewers** に自分を入れると、公開のたびに承認が必要になる（リリース PR のマージに加えた二重の関門）

### 2. GitHub App を作る

リリース PR を作るためのトークンに使う。GitHub Actions の標準トークンで作った PR では CI が動かず、ブランチ保護（CI 必須）でマージできないため。

1. GitHub の **Settings → Developer settings → GitHub Apps → New GitHub App** を開く
2. 次のとおり設定する
   - GitHub App name：任意（例：`note-blog-kit-release`）
   - Homepage URL：リポジトリの URL
   - Webhook：**Active のチェックを外す**
   - Repository permissions：**Contents: Read and write**、**Pull requests: Read and write**（Metadata: Read-only は自動で付く）。Workflows など、ほかの権限は付けない
   - Where can this GitHub App be installed?：**Only on this account**
3. 作成後の画面で **Client ID** を控え、**Generate a private key** で秘密鍵（`.pem`）をダウンロードする
4. 左メニューの **Install App** から、**note-blog-kit だけ**を選んでインストールする
5. 1 で作った **Environment「release」** に登録する（**Settings → Environments → release**。リポジトリ全体の Secrets ではなく Environment に置くことで、main 以外からは読めなくなる）
   - **Environment variables**：`RELEASE_APP_CLIENT_ID` に Client ID
   - **Environment secrets**：`RELEASE_APP_PRIVATE_KEY` に `.pem` ファイルの中身（全文）
6. ダウンロードした `.pem` は、登録後に手元から削除する

注意：

- 秘密鍵をチャット・Issue・リポジトリに貼らない。漏れた疑いがあるとき、管理する人が変わるときは、App の設定画面で鍵を削除（失効）し、作り直して登録し直す
- App をブランチ保護・ルールセットの **bypass に入れない**（入れると Contents の書き込み権限で main に直接 push できてしまう）
- リポジトリの **Settings → Actions → General** の「Allow GitHub Actions to create and approve pull requests」は**オフのままでよい**（PR は App が作るため）

### 3. npm の trusted publisher を設定する

設定から **2日以内**に最初の公開が成功しないと失効するため、**次のリリースの直前**に行う。

1. npmjs.com で **Packages → note-blog-kit → Settings → Trusted publishing** を開く
2. **Select your publisher** で **GitHub Actions** を選び、次のとおり入力する（大文字・小文字も完全一致）

   | 項目 | 値 |
   | --- | --- |
   | Organization or user | `ludy-kida` |
   | Repository | `note-blog-kit` |
   | Workflow filename | `release.yml` |
   | Environment name | **`release`**（main に制限した Environment。空欄にすると、どのブランチからでも公開できてしまう） |
   | Allowed actions | `npm publish` を許可する |

3. 2日以内にリリース PR をマージし、公開が成功することを確認する
4. 成功したら、**Settings → Publishing access** を **Require two-factor authentication and disallow tokens** にする（トークンでの公開を禁止する。trusted publishing には影響しない）

## リリースの流れ（毎回）

1. 機能の PR に changeset（`.changeset/*.md`）を含めてマージする
2. GitHub App がリリース PR（`chore: release`）を作成・更新する。内容（バージョン・CHANGELOG）を確認する
3. リリース PR の CI が通ったら、人がマージする
4. release ワークフローが npm に公開し、タグ（例：`note-blog-kit@0.2.0`）と GitHub Release を作る
5. `npm view note-blog-kit version` で公開されたことを確認する

## うまくいかないとき

- **リリース PR ができない**：Environment「release」に Client ID と秘密鍵が登録されているか、App がこのリポジトリにインストールされているかを確認する
- **ジョブが「Environment の保護ルール」で止まる**：main 以外から動いていないか、Required reviewers を設定した場合は承認待ちになっていないかを確認する
- **公開で `ENEEDAUTH` などの認証エラー**：trusted publisher の Workflow filename（`release.yml`）・Environment name（`release`）・リポジトリ名の綴りと、2日の期限切れを確認する。`changeset publish` は pnpm のワークスペースでは `pnpm publish` を使うことがあり、pnpm の版によっては OIDC に対応していない可能性がある（最初のリリースで確認する）
- **手元から公開する必要があるとき**（trusted publishing が使えない場合の非常手段。v0.1.0 はこの方法で公開した）：
  1. `pnpm install && pnpm build` のあと、`packages/note-blog-kit` で `npm pack --dry-run` を実行し、`dist/` が含まれていることを確認する
  2. `npm stage publish --provenance=false` を実行する（npm CLI 11.15.0 以上）
  3. `npm stage list note-blog-kit` で ID を確認し、npmjs.com の **Staged Packages** で **Approve** するか、`npm stage approve <ID>` で承認する（2FA が必要）
