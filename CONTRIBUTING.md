# 貢献のしかた

note-blog-kit への貢献をありがとうございます。脆弱性は Issue ではなく、[SECURITY.md](SECURITY.md) の方法で非公開で報告してください。

## 始める前に

- 不具合・要望・note の形の変化は、Issue のテンプレートから報告してください
- 大きな変更は、PR を作る前に Issue で相談してください
- 1 Issue = 1 PR、差分は 300 行前後を目安にしてください
- 互換性の方針（何を破壊的変更とみなすか）は [docs/stability.md](docs/stability.md) にあります

## 絶対に守ること

- **テスト・スクリプトから note.com にアクセスしない**でください（fetch・curl などすべて）。実レスポンスが必要なら [`fixtures/`](fixtures/) の保存済みレスポンスを使います
- **fixture はメンテナーが取得します**（`scripts/record-fixtures.ts`）。足りないときは、「何を取得したいか」を Issue に書いてください。`pnpm fixtures:plan --user <name>` は送信予定を表示するだけ（通信しない）なので、実行してかまいません
- 次の機能は受け付けません
  - ログインが必要な操作（投稿・編集・削除、スキやコメントの書き込み）
  - 有料部分の表示や、アクセス制限を回避する機能（Cookie・認証情報を送ること）
  - ブラウザから note へ直接アクセスする機能（note は CORS に対応していないため、取得はすべてサーバー側で行います）
  - 他人の記事の転載や、他のユーザーの検索
- 次の変更は、先に Issue で相談してください
  - 依存の追加（理由と代替案を書いてください）
  - サニタイズの許可リストと XSS テスト（`src/core/body-policy.ts`、`src/server/sanitize/` など）の変更
  - 公開 API（型・関数名・引数・subpath）の変更
- 既存のテストを削除したり、期待値を緩めたりする場合は、理由を PR に書いてください

## 開発の流れ

1. Node.js 24 以上と pnpm（ルートの `package.json` の `packageManager` の版）を用意し、`pnpm install` を実行します
2. 変更の受け入れ条件を表すテストを先に書きます（公開型は `*.test-d.ts` で確かめます）
3. 実装し、`pnpm check` を通します（lint・型・テスト・ビルド・サイズ・API レポート・配布物）
   - 公開 API を変えたら、`pnpm api` で `etc/*.api.md` を更新し、PR に書いてください
   - examples と README のコード例の型チェックは `pnpm build && pnpm build:examples` で確かめられます
4. 利用者に影響する変更なら、`pnpm changeset` で changeset を足します（バージョンの規則は [docs/stability.md](docs/stability.md)。破壊的変更は [MIGRATING.md](MIGRATING.md) にも移行のしかたを書きます）
5. README を変えたら、`pnpm readme:sync` で npm 用の README を作り直します
6. PR のテンプレートに沿って、変更の要約・テスト・人の判断が必要な変更を書きます

公開（npm へのリリース）はメンテナーが Changesets の release PR をマージして行います。

## AI エージェントで作業する場合

[CLAUDE.md](CLAUDE.md) とスキル（`.claude/skills/`）の決まりに従ってください。hooks が note.com へのアクセスと fixture の取得を止めます。
