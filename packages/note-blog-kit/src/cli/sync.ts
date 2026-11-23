/**
 * `note-blog-kit sync`：記事の一覧と本文を JSON に書き出す（ビルド時に実行する）。
 * 取得は /server の関数を使う。取得の間隔はライブラリの既定（1秒）のままで、短くする引数は作らない。
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { NoteArticleSummary } from '../core/types.js';
import { isNoteError } from '../server/errors.js';
import { getArticle } from '../server/get-article.js';
import { listAllArticles } from '../server/iterate-articles.js';
import { NOTE_KEY_RE, NOTE_USER_RE } from '../server/patterns.js';
import type { CliDeps } from './types.js';

export const SYNC_USAGE = `使い方: note-blog-kit sync --user <urlname> --out <dir> [--max-pages N] [--no-body]

note の記事の一覧と本文を JSON に書き出します（ビルド時に実行してください）。

  --user       note のユーザー名（note.com/<urlname> の部分）
  --out        出力先ディレクトリ（なければ作ります）
  --max-pages  一覧の最大ページ数（1ページ6件）。既定 20
  --no-body    本文を取得しない（一覧だけを書き出す）

出力:
  <dir>/articles.json        { user, syncedAt, truncated, articles }（記事の一覧）
  <dir>/articles/<key>.json  記事1件（サニタイズ済みの本文を含む）

note への負荷を抑えるため、リクエストは1秒以上の間隔で1件ずつ送ります。`;

const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES_LIMIT = 1000;

class UsageError extends Error {}

interface SyncOptions {
  user: string;
  out: string;
  maxPages: number;
  body: boolean;
}

function parseSyncArgs(argv: string[]): SyncOptions | 'help' {
  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        user: { type: 'string' };
        out: { type: 'string' };
        'max-pages': { type: 'string' };
        'no-body': { type: 'boolean' };
        help: { type: 'boolean'; short: 'h' };
      };
    }>
  >;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        user: { type: 'string' },
        out: { type: 'string' },
        'max-pages': { type: 'string' },
        'no-body': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values } = parsed;
  if (values.help === true) return 'help';

  const { user, out } = values;
  if (user === undefined || !NOTE_USER_RE.test(user)) {
    throw new UsageError('--user に note のユーザー名（英数字・_・-）を指定してください');
  }
  if (out === undefined || out.trim() === '') {
    throw new UsageError('--out に出力先のディレクトリを指定してください');
  }
  const rawMaxPages = values['max-pages'];
  const maxPages = rawMaxPages === undefined ? DEFAULT_MAX_PAGES : Number(rawMaxPages);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES_LIMIT) {
    throw new UsageError(`--max-pages は 1〜${MAX_PAGES_LIMIT} の整数で指定してください`);
  }
  return { user, out, maxPages, body: values['no-body'] !== true };
}

/** 一時ファイルに書いてから rename する（途中で止まっても、壊れた JSON を残さない） */
async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

function describeError(error: unknown): string {
  if (isNoteError(error)) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export async function runSync(argv: string[], deps: CliDeps): Promise<number> {
  const stdout = deps.stdout ?? console.log;
  const stderr = deps.stderr ?? console.error;

  let options: SyncOptions | 'help';
  try {
    options = parseSyncArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr(`${error.message}\n\n${SYNC_USAGE}`);
    return 2;
  }
  if (options === 'help') {
    stdout(SYNC_USAGE);
    return 0;
  }

  const { user, out, maxPages, body } = options;
  // テストからだけ差し替える（CLI の引数では変えられない）
  const request = {
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    ...(deps.minIntervalMs === undefined ? {} : { minIntervalMs: deps.minIntervalMs }),
  };

  stdout(`${user} の記事の一覧を取得しています（最大 ${maxPages} ページ、1秒に1リクエスト）...`);
  let articles: NoteArticleSummary[];
  let truncated: boolean;
  try {
    ({ articles, truncated } = await listAllArticles({ user, maxPages, ...request }));
  } catch (error) {
    stderr(`一覧の取得に失敗しました（何も書き出していません）: ${describeError(error)}`);
    return 1;
  }

  await mkdir(out, { recursive: true });
  await writeJson(join(out, 'articles.json'), { user, syncedAt: new Date().toISOString(), truncated, articles });
  stdout(
    `記事 ${articles.length} 件の一覧を ${join(out, 'articles.json')} に書き出しました${truncated ? `（${maxPages} ページで打ち切り）` : ''}`,
  );
  if (!body) return 0;

  const dir = join(out, 'articles');
  await mkdir(dir, { recursive: true });
  stdout(`本文を取得しています（${articles.length} 件、約 ${articles.length} 秒）...`);
  let failures = 0;
  for (const summary of articles) {
    const { key } = summary;
    // 一覧の正規化で検証済みだが、ファイル名に使うので書き込む直前にも確かめる
    if (!NOTE_KEY_RE.test(key)) {
      stderr(`記事キーの形式が不正なため飛ばしました: ${JSON.stringify(key)}`);
      failures += 1;
      continue;
    }
    try {
      const article = await getArticle({ key, ...request });
      if (article.author.urlname !== user) {
        stderr(`${key}: 著者が ${user} ではないため書き出しません（${article.author.urlname}）`);
        failures += 1;
        continue;
      }
      await writeJson(join(dir, `${key}.json`), article);
    } catch (error) {
      stderr(`${key}: 本文の取得に失敗しました: ${describeError(error)}`);
      failures += 1;
    }
  }
  const written = articles.length - failures;
  stdout(`本文 ${written} 件を ${dir} に書き出しました`);
  if (failures > 0) {
    stderr(`${failures} 件の本文を書き出せませんでした（上のメッセージを確認してください）`);
    return 1;
  }
  return 0;
}
