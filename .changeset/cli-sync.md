---
"note-blog-kit": minor
---

CLI `note-blog-kit sync --user <urlname> --out <dir>` を追加しました。記事の一覧（`articles.json`）と本文（`articles/<key>.json`）を JSON に書き出します。`--max-pages`（既定 20）で一覧のページ数を、`--no-body` で一覧だけにできます。リクエストは1秒以上の間隔で1件ずつ送ります。
