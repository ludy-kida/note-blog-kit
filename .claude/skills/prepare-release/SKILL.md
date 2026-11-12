---
name: prepare-release
description: リリース前に changeset を整理し、配布物を検証する手順。「リリースの準備をして」と頼まれたときに使う。npm への公開は行わない。
---

# prepare-release

**公開はしない**。`npm publish`・`pnpm publish`・`changeset publish` は禁止。公開は人が Changesets の release PR をマージして行う。

## 1. changeset を整理する

- `pnpm exec changeset status --verbose` で、次のバージョンと含まれる変更を確認する
- 重複・利用者に関係のない記述・粒度の揃わない記述があれば、`.changeset/*.md` を直す
- 0.x の間：破壊的変更と機能追加は minor、修正は patch。1.0 以降はセマンティックバージョニング

## 2. 配布物を検証する

- `pnpm check`（lint・型・テスト・カバレッジ・ビルド・サイズ・API レポート・publint・arethetypeswrong）
- `pnpm -C packages/note-blog-kit pack --pack-destination ../../temp` で tarball を作り、`tar -tzf` で中身を確認する。`dist/`・`README.md`・`LICENSE`・`package.json` 以外が入っていないこと
- examples のビルドが通ること（Phase 2 以降）

## 3. 確認事項をまとめる

人に次を報告する。

- 次のバージョンと変更の要約（CHANGELOG に載る内容）
- 公開 API の変更（`etc/*.api.md` の前回リリースからの差分）
- `/react` の gzip サイズ
- README 冒頭の注意事項が最新か

release PR のマージ（＝公開）は人が判断する。
