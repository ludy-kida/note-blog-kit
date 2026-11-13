import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { NoteArticleList, NotePagination } from 'note-blog-kit/react';
import { listArticles } from 'note-blog-kit/server';
import { NOTE_USER, noteFetch } from '../lib/note';

// 取得結果を1時間キャッシュする（キャッシュに当たれば note へのリクエストも、ライブラリの間隔待ちも起きない）
const getPage = unstable_cache((page: number) => listArticles({ user: NOTE_USER, page, fetch: noteFetch }), ['note'], {
  revalidate: 3600,
});

type Props = { searchParams: Promise<{ page?: string }> };

export default async function BlogPage({ searchParams }: Props) {
  const page = Number((await searchParams).page ?? '1');
  if (!Number.isInteger(page) || page < 1 || page > 100) notFound();
  const { articles, isLastPage, totalCount } = await getPage(page);
  if (articles.length === 0 && page > 1) notFound();
  return (
    <main>
      <h1>ブログ</h1>
      <NoteArticleList articles={articles} />
      <NotePagination page={page} isLastPage={isLastPage} totalCount={totalCount} getHref={(p) => `/?page=${p}`} />
    </main>
  );
}
