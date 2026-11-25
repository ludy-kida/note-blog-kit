---
"note-blog-kit": minor
---

**破壊的変更**：エラーモデルを v1.0 に向けて整理しました。
- HTTP 429 は `NOTE_HTTP_ERROR` ではなく、新しい `NOTE_RATE_LIMITED`（`NoteRateLimitError`。`retryAfterSeconds` で `Retry-After` の秒数を読めます）になりました。
- `NoteNetworkError`・`NoteTimeoutError`・`NoteSchemaError` に `url` を追加しました（`NoteSchemaError` は取得関数から投げられるときに入ります）。
- エラーのコンストラクタを内部用（`@internal`）にし、`NoteErrorOptions` の export をやめました。
- `NoteErrorCode` はマイナーバージョンで増えることがあります（`switch` には `default` を書いてください）。
- URL から受け取った記事キーを確かめる `isNoteArticleKey` を追加しました。
