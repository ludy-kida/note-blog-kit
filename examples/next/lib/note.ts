/**
 * 例専用の設定。本番のサイトでは不要（ユーザー名を直接書き、fetch は渡さなくてよい）。
 *
 * 既定は fixture モード：リポジトリの fixtures/ を返す fetch を使い、note にはアクセスしない
 * （CI とエージェントの確認はこのモードで行う。設定を忘れても実通信にならないよう、既定をこちらに倒している）。
 * 実際の note から取得するのは NOTE_BLOG_KIT_LIVE=1 と NOTE_USER を両方指定したときだけ。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LIVE = process.env.NOTE_BLOG_KIT_LIVE === '1';

if (LIVE && !process.env.NOTE_USER) {
  throw new Error('NOTE_BLOG_KIT_LIVE=1 のときは NOTE_USER（note のユーザー名）を指定してください');
}

/** 表示する note のユーザー名（fixture モードでは fixture の取得元） */
export const NOTE_USER = LIVE ? (process.env.NOTE_USER as string) : 'kida_lw';

/** キャッシュのキーに含めるモード（fixture の結果と実データが入れ替わらないようにする） */
export const NOTE_MODE = LIVE ? 'live' : 'fixture';

/** fixture 用：一覧 API の URL の page に応じて fixtures/contents/page-N.json を返す（3ページ目を最終ページとする） */
const fixtureFetch: typeof fetch = async (input) => {
  const page = Number(new URL(String(input)).searchParams.get('page') ?? '1');
  const file = join(process.cwd(), '..', '..', 'fixtures', 'contents', `page-${Math.min(page, 3)}.json`);
  const json = JSON.parse(await readFile(file, 'utf8')) as {
    data: { isLastPage: boolean; totalCount: number; contents: unknown[] };
  };
  // fixture は3ページ（18件）しかないので、総件数と最終ページをそれに合わせる
  json.data.totalCount = 18;
  json.data.isLastPage = page >= 3;
  if (page > 3) json.data.contents = [];
  return new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json' } });
};

/** listArticles に渡す fetch */
export const noteFetch: typeof fetch = LIVE ? fetch : fixtureFetch;
