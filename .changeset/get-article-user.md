---
"note-blog-kit": minor
---

**破壊的変更**：`getArticle` に必須の `user` を追加しました。`user` に指定した著者（大文字小文字も含めて一致）の記事だけを返し、ほかの著者の記事は `NoteNotFoundError`（`NOTE_NOT_FOUND`）になります。複数の著者で運用するサイトでは `user: ['alice', 'bob']` のように配列で指定できます。空の配列や不正な名前を渡すと、送信する前に `TypeError` になります。移行するには、`getArticle({ key })` を `getArticle({ key, user: 'your_urlname' })` にし、`article.author.urlname` を手で確かめていた処理を消してください。著者が違う場合のエラーは、記事が存在しない場合と同じ文面で、実際の著者名は含みません。CLI `sync` も、著者が `--user` でない記事をこの仕組みで書き出しません（stderr には `NOTE_NOT_FOUND` と出ます）。
