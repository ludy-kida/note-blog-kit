---
"note-blog-kit": minor
---

`note-blog-kit/next` に `generateNoteMetadata`（canonical の既定値は note の元 URL）と `generateNoteStaticParams`（`maxPages` で打ち切る）を追加しました。どちらも `next` には依存せず、Next.js の `Metadata`・`generateStaticParams` にそのまま渡せます。
