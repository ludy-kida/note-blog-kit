# セキュリティ

note-blog-kit は、信頼できない入力である note の記事本文を、サニタイズしてから表示するためのライブラリです。XSS などの脆弱性を見つけた場合は、**公開の Issue・PR・Discussions には書かず**、次の方法で非公開で報告してください。

## 報告の方法

GitHub の Private vulnerability reporting を使います。

1. リポジトリの「Security」タブを開く
2. 「Report a vulnerability」から報告する

報告には、次のものを含めてください。

- 対象のバージョン（`note-blog-kit` の版、Node.js・React・Next.js の版）
- 再現する入力（本文 HTML、URL、CLI の引数など）と手順
- 影響（どの利用者に、何が起きるか）

Cookie・認証情報・有料記事の本文・他人の記事は、報告に含めないでください。

## 対象のバージョン

| バージョン | 修正するか |
| --- | --- |
| 1.x の最新のマイナーバージョン（1.0.0 以降） | 修正します |
| それより古い 1.x | 最新のマイナーバージョンへの更新をお願いします |
| 0.x（1.0.0 より前） | 1.0.0 の公開までは最新の 0.x だけを修正します |

修正はパッチリリースで出し、GitHub Security Advisory で公開します。報告者の名前は、希望があれば Advisory に載せます。

## 対応の目安

| 段階 | 目安 |
| --- | --- |
| 受け付けた連絡 | 7 日以内 |
| 再現の確認と深刻度の判断 | 14 日以内 |
| 修正のリリース | 深刻なもの（XSS など）は 30 日以内 |

個人で開発しているため、目安より遅れることがあります。その場合は、報告のスレッドで状況をお知らせします。

## 対象にするもの

- 本文 HTML のサニタイズの抜け（XSS、DOM clobbering など）。方針は [docs/sanitize-policy.md](docs/sanitize-policy.md)
- `note-blog-kit/react` での URL の検証の抜け（`javascript:` の URL がリンクになるなど）
- 中継エンドポイント（`createNoteArticlesHandler`）の入力の検証の抜け
- CLI `sync` の書き出し先の扱い（シンボリックリンクをたどって意図しない場所に書くなど）
- note 以外のホストへ、意図せずリクエストを送ってしまう問題

## 対象にしないもの

- note 本体の脆弱性（note 株式会社へ報告してください）
- 利用者が `href`・`getHref`・`readMoreHref` などに、信頼できない値を渡した場合（README に注意を書いています）
- note の非公式 API の仕様変更で動かなくなる問題（通常の Issue の「note の形の変化」で報告してください）
- 公開する範囲に含めないものの変化（[docs/stability.md](docs/stability.md) を参照）
