/**
 * note.com の実レスポンスを fixtures/ に保存するスクリプト。
 *
 * このリポジトリで note.com にアクセスしてよいのは、このスクリプトを「人が」実行するときだけ。
 * - エージェントは実行しない（.claude/settings.json と PreToolUse hook で止めている）
 * - 端末（TTY）での y/N 確認がないと通信しない
 * - リクエストは直列で、間隔は最低1秒。ページ数・記事数に上限がある
 * - Cookie や認証ヘッダーは送らない（未ログインで見える公開情報だけを取る）
 * - 保存前に機微なキーを削除し、メールアドレスを伏せる。削除した内容は manifest.json に残す
 *
 * 実行: node scripts/record-fixtures.ts --user <urlname>   （Node.js 22.18 以上）
 * 確認だけ: node scripts/record-fixtures.ts --user <urlname> --dry-run
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  assertNoteUrl,
  ConfigError,
  contentsRequest,
  MAX_NOTES_LIMIT,
  MIN_INTERVAL_MS,
  noteRequest,
  type PlannedRequest,
  parseConfig,
  pickNoteKeys,
  type RecordConfig,
  redactEmails,
  rssRequest,
  shouldFetchNextPage,
  stripSensitive,
  USAGE,
  waitBeforeNext,
} from './lib/fixture-utils.ts';

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'note-blog-kit-fixture-recorder/0.0 (manual run; 1 req/s)';
/** CORS の可否を記録するため、ブラウザからのアクセスを装わない架空の Origin を付ける */
const PROBE_ORIGIN = 'https://example.com';
const ERROR_BODY_PREVIEW = 2000;

interface ManifestEntry {
  kind: PlannedRequest['kind'];
  url: string;
  file: string | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  /** レスポンスの Access-Control-Allow-Origin。null なら付いていない（ブラウザから直接は読めない） */
  accessControlAllowOrigin: string | null;
  location: string | null;
  durationMs: number;
  removedKeys: string[];
  redactedPaths: string[];
  error?: string;
  bodyPreview?: string;
}

interface Manifest {
  recordedAt: string;
  user: string;
  config: { maxPages: number; noteKeys: string[]; minIntervalMs: number };
  entries: ManifestEntry[];
}

class Recorder {
  private lastSentAt: number | undefined;
  readonly entries: ManifestEntry[] = [];
  private readonly outDir: string;

  // Node.js の型ストリッピングはパラメータプロパティを扱えないため、明示的に代入する
  constructor(outDir: string) {
    this.outDir = outDir;
  }

  /** 取得して保存する。JSON ならパースした値を返す（それ以外・失敗時は undefined） */
  async record(request: PlannedRequest): Promise<unknown> {
    assertNoteUrl(request.url);
    const wait = waitBeforeNext(this.lastSentAt, Date.now());
    if (wait > 0) await sleep(wait);

    this.lastSentAt = Date.now();
    const startedAt = this.lastSentAt;
    process.stdout.write(`GET ${request.url} ... `);

    const entry: ManifestEntry = {
      kind: request.kind,
      url: request.url,
      file: null,
      status: null,
      ok: false,
      contentType: null,
      accessControlAllowOrigin: null,
      location: null,
      durationMs: 0,
      removedKeys: [],
      redactedPaths: [],
    };
    this.entries.push(entry);

    let response: Response;
    let body: string;
    try {
      response = await fetch(request.url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        headers: {
          Accept: request.kind === 'rss' ? 'application/rss+xml, application/xml;q=0.9' : 'application/json',
          'User-Agent': USER_AGENT,
          Origin: PROBE_ORIGIN,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      body = await response.text();
    } catch (error) {
      entry.durationMs = Date.now() - startedAt;
      entry.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.log(`失敗 (${entry.error})`);
      return undefined;
    }

    entry.durationMs = Date.now() - startedAt;
    entry.status = response.status;
    entry.ok = response.ok;
    entry.contentType = response.headers.get('content-type');
    entry.accessControlAllowOrigin = response.headers.get('access-control-allow-origin');
    entry.location = response.headers.get('location');
    console.log(`${response.status} (${entry.durationMs}ms)`);

    if (!response.ok) {
      entry.bodyPreview = redactEmails(body.slice(0, ERROR_BODY_PREVIEW)).text;
      return undefined;
    }

    if (request.kind === 'rss') {
      const { text, count } = redactEmails(body);
      if (count > 0) entry.redactedPaths.push(`(rss: ${count}件)`);
      await this.write(request.file, text);
      entry.file = request.file;
      return undefined;
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      entry.error = 'JSON として解釈できませんでした';
      entry.bodyPreview = redactEmails(body.slice(0, ERROR_BODY_PREVIEW)).text;
      return undefined;
    }
    const stripped = stripSensitive(json);
    entry.removedKeys = stripped.removedKeys;
    entry.redactedPaths = stripped.redactedPaths;
    await this.write(request.file, `${JSON.stringify(stripped.value, null, 2)}\n`);
    entry.file = request.file;
    // ページ送りや記事キーの選択には、除去後の値を使う
    return stripped.value;
  }

  async write(file: string, content: string): Promise<void> {
    const path = join(this.outDir, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
}

function describePlan(config: RecordConfig): string[] {
  const lines = [
    `保存先: ${resolve(config.outDir)}`,
    `リクエスト間隔: ${MIN_INTERVAL_MS}ms 以上、直列`,
    '',
    '送信予定のリクエスト:',
  ];
  for (let page = 1; page <= config.maxPages; page += 1) {
    const suffix = page === 1 ? '' : '  （前のページが最終ページでなければ）';
    lines.push(`  GET ${contentsRequest(config.user, page).url}${suffix}`);
  }
  if (config.noteKeys.length > 0) {
    for (const key of config.noteKeys) lines.push(`  GET ${noteRequest(key).url}`);
  } else {
    lines.push(
      `  GET ${noteRequest('KEY').url.replace(/KEY$/, '<key>')}  （1ページ目から無料・有料を各1件まで自動選択）`,
    );
  }
  lines.push(`  GET ${rssRequest(config.user).url}`);
  const max = config.maxPages + (config.noteKeys.length > 0 ? config.noteKeys.length : 2) + 1;
  lines.push('', `最大 ${max} リクエスト（記事キーは最大 ${MAX_NOTES_LIMIT} 件）`);
  return lines;
}

async function confirm(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      '端末（TTY）から実行してください。このスクリプトは人が確認してから実行する前提のため、非対話環境では通信しません。',
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('note.com にアクセスします。続けますか？ [y/N] ');
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  let config: RecordConfig;
  try {
    config = parseConfig(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    throw error;
  }
  if (config.help) {
    console.log(USAGE);
    return 0;
  }

  console.log(describePlan(config).join('\n'));
  console.log('');
  if (config.dryRun) {
    console.log('--dry-run のため通信しません。');
    return 0;
  }
  if (!(await confirm())) {
    console.log('中止しました。');
    return 1;
  }

  const recorder = new Recorder(config.outDir);

  // 1. 記事一覧（ページ送り）
  let firstPage: unknown;
  for (let page = 1; page <= config.maxPages; page += 1) {
    const json = await recorder.record(contentsRequest(config.user, page));
    if (page === 1) firstPage = json;
    if (!shouldFetchNextPage(json)) break;
  }

  // 2. 記事本文
  const noteKeys = config.noteKeys.length > 0 ? config.noteKeys : pickNoteKeys(firstPage);
  if (noteKeys.length === 0) {
    console.log('本文を取得する記事キーが見つかりませんでした（--notes で指定できます）。');
  }
  for (const key of noteKeys) {
    await recorder.record(noteRequest(key));
  }

  // 3. RSS
  await recorder.record(rssRequest(config.user));

  const manifest: Manifest = {
    recordedAt: new Date().toISOString(),
    user: config.user,
    config: { maxPages: config.maxPages, noteKeys, minIntervalMs: MIN_INTERVAL_MS },
    entries: recorder.entries,
  };
  await recorder.write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  const removed = recorder.entries.reduce((sum, entry) => sum + entry.removedKeys.length, 0);
  const redacted = recorder.entries.reduce((sum, entry) => sum + entry.redactedPaths.length, 0);
  const failed = recorder.entries.filter((entry) => !entry.ok);
  console.log('');
  console.log(`保存しました: ${resolve(config.outDir)}`);
  console.log(`削除したキー ${removed} 件、伏せたメールアドレス ${redacted} 箇所（詳細は manifest.json）`);
  if (failed.length > 0) {
    console.log(`失敗・非200のリクエスト ${failed.length} 件:`);
    for (const entry of failed) console.log(`  ${entry.status ?? '-'} ${entry.url}`);
  }
  console.log('コミットする前に、保存したファイルと manifest.json を目で確認してください。');
  return 0;
}

process.exitCode = await main();
