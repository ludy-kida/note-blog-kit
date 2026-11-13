import { NoteArticleList, NotePagination } from 'note-blog-kit/react';
import { listArticles } from 'note-blog-kit/server';
import { NOTE_USER, noteFetch } from '../lib/note';

type Props = { searchParams: Promise<{ page?: string }> };

export default async function BlogPage({ searchParams }: Props) {
  const page = Number((await searchParams).page ?? '1') || 1;
  const { articles, isLastPage, totalCount } = await listArticles({ user: NOTE_USER, page, fetch: noteFetch });
  return (
    <main>
      <h1>ブログ</h1>
      <NoteArticleList articles={articles} />
      <NotePagination page={page} isLastPage={isLastPage} totalCount={totalCount} getHref={(p) => `/?page=${p}`} />
    </main>
  );
}
