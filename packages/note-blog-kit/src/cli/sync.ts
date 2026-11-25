/**
 * `note-blog-kit sync`：記事の一覧と本文を JSON に書き出す（ビルド時に実行する）。
 * 取得は /server の関数を使う。取得の間隔はライブラリの既定（1秒）のままで、短くする引数は作らない。
 */
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { NoteArticleSummary } from '../core/types.js';
import { isNoteError } from '../server/errors.js';
import { getArticle } from '../server/get-article.js';
import { listAllArticles } from '../server/iterate-articles.js';
import { NOTE_KEY_RE, NOTE_USER_RE } from '../server/patterns.js';
import type { CliDeps } from './types.js';

export const SYNC_USAGE = `使い方: note-blog-kit sync --user <urlname> --out <dir> [--max-pages N] [--no-body] [--allow-empty]

note の記事の一覧と本文を JSON に書き出します（ビルド時に実行してください）。

  --user       note のユーザー名（note.com/<urlname> の部分）
  --out        出力先ディレクトリ（なければ作ります）
  --max-pages  一覧の最大ページ数（1ページ6件）。既定 20
  --no-body    本文を取得しない（一覧だけを書き出す）
  --allow-empty  前回は記事があったのに今回の一覧が空でも書き出す（既定では何も変えずに失敗する）

出力:
  <dir>/articles.json        { user, syncedAt, truncated, articles }（記事の一覧）
  <dir>/articles/<key>.json  記事1件（サニタイズ済みの本文を含む）

note への負荷を抑えるため、リクエストは1秒以上の間隔で1件ずつ送ります。
本文を一時的に取得できなかった記事（通信の失敗・タイムアウト・5xx・429）は、前回の本文を残します（終了コードは 1）。`;

const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES_LIMIT = 1000;

class UsageError extends Error {}

interface SyncOptions {
  user: string;
  out: string;
  maxPages: number;
  body: boolean;
  allowEmpty: boolean;
}

function parseSyncArgs(argv: string[]): SyncOptions | 'help' {
  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        user: { type: 'string' };
        out: { type: 'string' };
        'max-pages': { type: 'string' };
        'no-body': { type: 'boolean' };
        'allow-empty': { type: 'boolean' };
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
        'allow-empty': { type: 'boolean' },
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
  return { user, out, maxPages, body: values['no-body'] !== true, allowEmpty: values['allow-empty'] === true };
}

/** 一時ファイルに書いてから rename する（途中で止まっても、壊れた JSON を残さない） */
async function writeJson(path: string, value: unknown): Promise<void> {
  // 推測しにくい名前で、既存のファイル（シンボリックリンクを含む）には書かない（wx）
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

const ARTICLE_FILE_RE = /^n[0-9a-z]{1,32}\.json$/;

/**
 * 今回書き出さなかった記事のファイルを消す（削除・非公開・有料化した記事の本文を公開し続けないため）。
 * 消すのは記事キーの形の .json だけ（利用者が置いたほかのファイルには触れない）
 */
async function removeStaleArticles(dir: string, keep: Set<string>): Promise<string[]> {
  const removed: string[] = [];
  for (const name of await readdir(dir)) {
    if (!ARTICLE_FILE_RE.test(name) || keep.has(name.slice(0, -'.json'.length))) continue;
    await rm(join(dir, name), { force: true });
    removed.push(name);
  }
  return removed;
}

/** 前回の articles.json として読む最大の大きさ（バイト） */
const MAX_PREVIOUS_LIST_BYTES = 10 * 1024 * 1024;

/**
 * 前回の出力に記事があったか。articles.json に記事が1件以上あるか、articles/ に記事のファイルがあれば true。
 * articles.json は通常のファイル（シンボリックリンクでない）で、大きすぎないときだけ読む
 */
async function hadArticles(listPath: string, dir: string): Promise<boolean> {
  try {
    const stat = await lstat(listPath);
    if (stat.isFile() && stat.size <= MAX_PREVIOUS_LIST_BYTES) {
      const previous = JSON.parse(await readFile(listPath, 'utf8')) as { articles?: unknown } | null;
      if (Array.isArray(previous?.articles) && previous.articles.length > 0) return true;
    }
  } catch {
    // ない・読めない・壊れている
  }
  try {
    if ((await lstat(dir)).isDirectory()) return (await readdir(dir)).some((name) => ARTICLE_FILE_RE.test(name));
  } catch {
    // ない
  }
  return false;
}

/** パスがシンボリックリンクか（存在しなければ false） */
async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * 一時的な失敗か（前回の本文を残す）：通信の失敗・タイムアウト・5xx・429。
 * それ以外（404・ほかの 4xx・形の違い・書き込みの失敗）では前回の本文を消す
 * （有料化した記事の全文や、古いサニタイザーで作った本文を残し続けないため）
 */
function isTransient(error: unknown): boolean {
  if (!isNoteError(error)) return false;
  if (error.code === 'NOTE_NETWORK_ERROR' || error.code === 'NOTE_TIMEOUT') return true;
  return error.code === 'NOTE_HTTP_ERROR' && (error.status >= 500 || error.status === 429);
}

/** ディレクトリの実体（作ったときと同じディレクトリか、シンボリックリンクに差し替えられていないかを確かめる） */
async function dirIdentity(dir: string): Promise<string | null> {
  const stat = await lstat(dir);
  return stat.isDirectory() ? `${stat.dev}:${stat.ino}` : null;
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

  const { user, out, maxPages, body, allowEmpty } = options;
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

  // 一覧は --user の記事だけにする（本文と同じ規則）
  const others = articles.filter((article) => article.author.urlname !== user);
  for (const article of others) {
    stderr(`${article.key}: 著者が ${user} ではないため一覧から除きました（${article.author.urlname}）`);
  }
  articles = articles.filter((article) => article.author.urlname === user);

  // note の一時的な障害で空の一覧が返っても、前回の出力を消さない
  const dir = join(out, 'articles');
  if (articles.length === 0 && !allowEmpty && (await hadArticles(join(out, 'articles.json'), dir))) {
    stderr(
      '一覧が空でした。前回は記事があったため、何も書き換えていません（空にしてよい場合は --allow-empty を付けてください）',
    );
    return 1;
  }
  // リンク先のファイルを消さないよう、本文の出力先がシンボリックリンクなら何も書き出さずに止める
  if (body && (await isSymlink(dir))) {
    stderr(`${dir} がシンボリックリンクのため、何も書き出していません`);
    return 1;
  }

  try {
    await mkdir(out, { recursive: true });
    await writeJson(join(out, 'articles.json'), { user, syncedAt: new Date().toISOString(), truncated, articles });
  } catch (error) {
    stderr(`${join(out, 'articles.json')} に書き出せませんでした: ${describeError(error)}`);
    return 1;
  }
  stdout(
    `記事 ${articles.length} 件の一覧を ${join(out, 'articles.json')} に書き出しました${truncated ? `（${maxPages} ページで打ち切り）` : ''}`,
  );
  if (!body) return others.length > 0 ? 1 : 0;

  let identity: string | null;
  try {
    await mkdir(dir, { recursive: true });
    identity = await dirIdentity(dir);
  } catch (error) {
    stderr(`${dir} を作れませんでした: ${describeError(error)}`);
    return 1;
  }
  if (identity === null) {
    stderr(`${dir} がディレクトリではないため、本文を書き出していません`);
    return 1;
  }
  /** 取得の間（数分かかる）にシンボリックリンクなどへ差し替えられていないか、書き込み・削除の直前に確かめる */
  const sameDir = async (): Promise<boolean> => (await dirIdentity(dir).catch(() => null)) === identity;
  stdout(`本文を取得しています（${articles.length} 件、約 ${articles.length} 秒）...`);
  let failures = others.length;
  const written = new Set<string>();
  // 一時的に取得できなかった記事（前回の本文を残す）
  const kept = new Set<string>();
  let replaced = false;
  for (const summary of articles) {
    const { key } = summary;
    // 一覧の正規化で検証済みだが、ファイル名に使うので書き込む直前にも確かめる
    if (!NOTE_KEY_RE.test(key)) {
      stderr(`記事キーの形式が不正なため飛ばしました: ${JSON.stringify(key)}`);
      failures += 1;
      continue;
    }
    try {
      // 著者が --user でない記事は NoteNotFoundError になり、書き出さない（メッセージに著者名が入る）
      const article = await getArticle({ key, user, ...request });
      if (!(await sameDir())) {
        replaced = true;
        break;
      }
      await writeJson(join(dir, `${key}.json`), article);
      written.add(key);
    } catch (error) {
      const transient = isTransient(error);
      if (transient) kept.add(key);
      stderr(
        `${key}: 本文を書き出せませんでした${transient ? '（一時的な失敗のため、前回の本文があれば残します）' : ''}: ${describeError(error)}`,
      );
      failures += 1;
    }
  }
  if (replaced || !(await sameDir())) {
    stderr(`${dir} が取得の途中で差し替えられたため、書き出し・削除を止めました`);
    return 1;
  }
  // 一覧にない記事と、一時的な失敗以外で取得できなかった記事の古い本文を消す
  // （削除・非公開・有料化した記事の全文や、古いサニタイザーで作った本文を公開し続けないように）
  let removed: string[];
  try {
    removed = await removeStaleArticles(dir, new Set([...written, ...kept]));
  } catch (error) {
    stderr(`${dir} の古いファイルを消せませんでした: ${describeError(error)}`);
    return 1;
  }
  stdout(`本文 ${written.size} 件を ${dir} に書き出しました`);
  if (removed.length > 0) stdout(`前回の本文 ${removed.length} 件を消しました（${removed.join(', ')}）`);
  if (failures > 0) {
    stderr(`${failures} 件の本文を書き出せませんでした（上のメッセージを確認してください）`);
    return 1;
  }
  return 0;
}
