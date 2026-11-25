import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { generateNoteMetadata, generateNoteStaticParams } from 'note-blog-kit/next';
import { NoteArticleBody } from 'note-blog-kit/react';
import { getArticle, isNoteError } from 'note-blog-kit/server';
import { NOTE_MODE, NOTE_USER, noteFetch, noteInterval } from '../../../lib/note';

// 自分の記事のキー（新しい順に 20 ページ分 = 120件）。ビルド時の静的生成と、詳細ページで取得してよいキーの確認に使う
const loadParams = unstable_cache(
  () => generateNoteStaticParams({ user: NOTE_USER, fetch: noteFetch, ...noteInterval }),
  ['note-article-params', NOTE_MODE, NOTE_USER],
  { revalidate: 3600 },
);

// 記事を1時間キャッシュする（generateMetadata とページで同じ記事を2回取得しないためにも使う）。
// user にない著者の記事は NoteNotFoundError になるので、他人の記事はキャッシュにも入らない
const loadArticle = unstable_cache(
  (user: string, key: string) => getArticle({ key, user, fetch: noteFetch, ...noteInterval }),
  ['note-article', NOTE_MODE],
  { revalidate: 3600 },
);

/** 記事を取得する。自分の記事の一覧にないキー（URL から自由に指定される）は note に問い合わせずに 404 */
async function findArticle(key: string) {
  if (!(await loadParams()).some((params) => params.key === key)) notFound();
  const article = await loadArticle(NOTE_USER, key).catch((error: unknown) => {
    if (isNoteError(error) && error.code === 'NOTE_NOT_FOUND') return null;
    throw error;
  });
  if (article === null) notFound();
  return article;
}

type Props = { params: Promise<{ key: string }> };

// ビルド時に自分の記事を生成する。一覧にない古い記事（20 ページより前）は 404 になるので、必要なら maxPages を増やす
export const generateStaticParams = loadParams;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // canonical は既定で note の元 URL になる
  return generateNoteMetadata(await findArticle((await params).key), { formatTitle: (title) => `${title} | ブログ` });
}

export default async function ArticlePage({ params }: Props) {
  const article = await findArticle((await params).key);
  return (
    <main>
      <p>
        <Link href="/">← 記事一覧</Link>
      </p>
      <h1>{article.title}</h1>
      <NoteArticleBody article={article} />
    </main>
  );
}
