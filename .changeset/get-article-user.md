---
"note-blog-kit": minor
---

**破壊的変更**：`getArticle` に必須の `user` を追加しました。`user` に指定した著者の記事だけを返し、ほかの著者の記事は `NoteNotFoundError`（`NOTE_NOT_FOUND`）になります。複数の著者で運用するサイトでは `user: ['alice', 'bob']` のように配列で指定できます。移行するには、`getArticle({ key })` を `getArticle({ key, user: 'your_urlname' })` にし、`article.author.urlname` を手で確かめていた処理を消してください。CLI `sync` も、著者が `--user` でない記事をこの仕組みで書き出しません。
