# fixtures

note.com の実レスポンスを保存する場所。テストとエージェントの作業はここだけを使い、実 API にはアクセスしない。

## 取得のしかた（人が実行する）

前提：Node.js 22.18 以上。依存のインストールは不要。

1. `scripts/record-fixtures.ts` と `scripts/lib/fixture-utils.ts` を読む
2. 送信予定を確認する（通信しない）

   ```bash
   pnpm fixtures:plan --user <あなたのurlname>
   ```

3. 端末から実行し、確認に `y` と答える

   ```bash
   pnpm fixtures:record --user <あなたのurlname>
   ```

   本文を取る記事を指定する場合（無料・有料を含めると Phase 0 の分析に役立つ）：

   ```bash
   pnpm fixtures:record --user <あなたのurlname> --notes <無料記事のキー>,<有料記事のキー>
   ```

4. 保存されたファイルと `manifest.json` を目で確認してからコミットする

## スクリプトの安全策

- 端末（TTY）での y/N 確認がないと通信しない。エージェントからは実行できない（`.claude/settings.json` と hook で禁止）
- リクエストは直列・最低1秒間隔。contents は最大10ページ、本文は最大5件
- 送信先は `https://note.com` のみ。リダイレクトは追わずに記録する
- Cookie・認証ヘッダーは送らない（未ログインで見える公開情報だけ）
- 保存前にメールアドレス・トークン・セッションなどの機微なキーと、他ユーザーの一覧（スキした人、コメントなど）を削除し、文字列中のメールアドレスを伏せる。
  キー名は推測を含むため、削除したパスは `manifest.json` の `removedKeys` で確認する

## 保存されるファイル

| パス | 内容 |
| --- | --- |
| `contents/page-N.json` | `/api/v2/creators/{user}/contents?kind=note&page=N` |
| `notes/{key}.json` | `/api/v3/notes/{key}` |
| `rss/feed.xml` | `/{user}/rss` |
| `manifest.json` | 取得日時、各リクエストのステータス・Content-Type・`Access-Control-Allow-Origin`（CORS の記録）・削除したキー。非200のときは本文の先頭を `bodyPreview` に残す |
