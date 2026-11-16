import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { generateNoteMetadata, generateNoteStaticParams } from 'note-blog-kit/next';
import { NoteArticleBody } from 'note-blog-kit/react';
import { getArticle, isNoteError } from 'note-blog-kit/server';
import { NOTE_MODE, NOTE_USER, noteFetch, noteInterval } from '../../../lib/note';

// 取得結果を1時間キャッシュする（generateMetadata とページで同じ記事を2回取得しないためにも使う）
const loadArticle = unstable_cache(
  (key: string) => getArticle({ key, fetch: noteFetch, ...noteInterval }),
  ['note-article', NOTE_MODE],
  { revalidate: 3600 },
);

/** 記事を取得する。キーが不正・見つからない・自分の記事でなければ 404 */
async function findArticle(key: string) {
  const article = await loadArticle(key).catch((error: unknown) => {
    if (error instanceof TypeError || (isNoteError(error) && error.code === 'NOTE_NOT_FOUND')) return null;
    throw error;
  });
  // getArticle は誰の記事でも返すので、URL のキーを書き換えて他人の記事を表示されないよう著者を確かめる
  if (article === null || article.author.urlname !== NOTE_USER) notFound();
  return article;
}

type Props = { params: Promise<{ key: string }> };

// ビルド時に新しい記事から 20 ページ分（120件）を生成する。それより古い記事は最初のアクセス時に生成される
export const generateStaticParams = () =>
  generateNoteStaticParams({ user: NOTE_USER, fetch: noteFetch, ...noteInterval });

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
