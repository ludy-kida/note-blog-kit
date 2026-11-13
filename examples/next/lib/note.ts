/**
 * 例専用の設定。本番のサイトでは NOTE_USER と、キャッシュを効かせる fetch だけがあれば足りる。
 *
 * NOTE_BLOG_KIT_FIXTURES=1 のときは、リポジトリの fixtures/ を返す fetch を使い、note にアクセスしない
 * （CI とエージェントの確認はこのモードだけで行う）。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 表示する note のユーザー名 */
export const NOTE_USER = process.env.NOTE_USER ?? 'kida_lw';

/** 本番用：Next.js のデータキャッシュで1時間ごとに取り直す */
const cachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, next: { revalidate: 3600 } });

/** fixture 用：一覧 API の URL の page に応じて fixtures/contents/page-N.json を返す（4ページ目以降は最終ページ扱い） */
const fixtureFetch: typeof fetch = async (input) => {
  const page = Number(new URL(String(input)).searchParams.get('page') ?? '1');
  const file = join(process.cwd(), '..', '..', 'fixtures', 'contents', `page-${Math.min(page, 3)}.json`);
  const json = JSON.parse(await readFile(file, 'utf8')) as { data: { isLastPage: boolean } };
  json.data.isLastPage = page >= 3;
  return new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json' } });
};

export const noteFetch: typeof fetch = process.env.NOTE_BLOG_KIT_FIXTURES === '1' ? fixtureFetch : cachedFetch;
