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

/**
 * fixture 用の fetch。
 * - 記事本文 API（/api/v3/notes/{key}）：fixtures/notes/{key}.json があれば返し、なければ 404
 * - 一覧 API：page に応じて fixtures/contents/page-N.json を返す（3ページ目を最終ページとする）
 */
const fixtureFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const noteKey = /^\/api\/v3\/notes\/(n[0-9a-z]+)$/.exec(url.pathname)?.[1];
  if (noteKey !== undefined) {
    const file = join(process.cwd(), '..', '..', 'fixtures', 'notes', `${noteKey}.json`);
    const body = await readFile(file, 'utf8').catch(() => null);
    return body === null ? new Response('{"data":"not found"}', { status: 404 }) : new Response(body);
  }
  const page = Number(url.searchParams.get('page') ?? '1');
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

/** listArticles・getArticle などに渡す fetch */
export const noteFetch: typeof fetch = LIVE ? fetch : fixtureFetch;

/** 取得の間隔。fixture モードでは通信しないので待たない（ビルドを速くする） */
export const noteInterval: { minIntervalMs?: number } = LIVE ? {} : { minIntervalMs: 0 };
