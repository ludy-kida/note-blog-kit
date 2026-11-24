#!/usr/bin/env node
/**
 * fixture から public/note/articles.json を作る（CI と、note にアクセスせずに試すとき用）。
 * 出力の形は `note-blog-kit sync --no-body` と同じ。実データは README の手順で sync を実行する。
 * 事前にリポジトリのルートで `pnpm build` を実行しておくこと（ビルド済みの note-blog-kit/server を使う）。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAllArticles } from 'note-blog-kit/server';

const exampleDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(exampleDir, '..', '..', 'fixtures', 'contents');
const USER = 'kida_lw';

/** 一覧 API の page に応じて fixtures/contents/page-N.json を返す（3ページ目を最終ページとする） */
const fixtureFetch = async (input) => {
  const page = Number(new URL(String(input)).searchParams.get('page') ?? '1');
  const json = JSON.parse(await readFile(join(fixturesDir, `page-${Math.min(page, 3)}.json`), 'utf8'));
  json.data.isLastPage = page >= 3;
  if (page > 3) json.data.contents = [];
  return new Response(JSON.stringify(json));
};

const { articles, truncated } = await listAllArticles({ user: USER, fetch: fixtureFetch, minIntervalMs: 0 });
const out = join(exampleDir, 'public', 'note');
await mkdir(out, { recursive: true });
await writeFile(
  join(out, 'articles.json'),
  `${JSON.stringify({ user: USER, syncedAt: new Date().toISOString(), truncated, articles }, null, 2)}\n`,
);
console.log(`fixture の記事 ${articles.length} 件を ${join(out, 'articles.json')} に書き出しました`);
