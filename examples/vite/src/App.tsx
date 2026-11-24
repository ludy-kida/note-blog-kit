import { NoteArticleList, useNoteArticles } from 'note-blog-kit/react';

/**
 * `note-blog-kit sync` が public/note/ に書き出した JSON を読んで一覧を表示する。
 * ブラウザから note には直接アクセスしない（note は CORS に対応していない）。
 */
export function App() {
  const { articles, isLoading, error } = useNoteArticles({ url: '/note/articles.json' });
  return (
    <main>
      <h1>ブログ</h1>
      {isLoading && <p>読み込み中…</p>}
      {error && <p role="alert">記事を読み込めませんでした（{error.message}）</p>}
      {!isLoading && !error && <NoteArticleList articles={articles} />}
    </main>
  );
}
