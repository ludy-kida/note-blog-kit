/**
 * record-fixtures.ts の純粋なロジック（ネットワークに触れない部分）。
 * テストから import できるよう、fetch や標準入力には依存しない。
 */
import { parseArgs } from 'node:util';

export const NOTE_ORIGIN = 'https://note.com';
export const NOTE_HOST = 'note.com';
/** 1回の実行で取得する contents のページ数の上限（これより大きい値は受け付けない） */
export const MAX_PAGES_LIMIT = 10;
export const DEFAULT_MAX_PAGES = 3;
/** 本文を取得する記事数の上限 */
export const MAX_NOTES_LIMIT = 5;
/** リクエスト間の最小間隔 */
export const MIN_INTERVAL_MS = 1000;
export const DEFAULT_OUT_DIR = 'fixtures';

export interface RecordConfig {
  user: string;
  maxPages: number;
  /** 明示指定された記事キー。空なら contents の1ページ目から自動で選ぶ */
  noteKeys: string[];
  outDir: string;
  dryRun: boolean;
  help: boolean;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NOTE_KEY_RE = /^[A-Za-z0-9]{1,32}$/;

export const USAGE = `使い方:
  node scripts/record-fixtures.ts --user <urlname> [--max-pages N] [--notes key1,key2] [--out dir] [--dry-run]

  --user       noteのユーザー名（note.com/<urlname> の部分）。必須
  --max-pages  contents を取得する最大ページ数（既定 ${DEFAULT_MAX_PAGES}、上限 ${MAX_PAGES_LIMIT}）
  --notes      本文を取得する記事キー（カンマ区切り、最大 ${MAX_NOTES_LIMIT} 件）。
               省略時は contents の1ページ目から無料記事1件・有料記事1件を選ぶ
  --out        保存先ディレクトリ（既定 ${DEFAULT_OUT_DIR}）
  --dry-run    通信せず、送る予定のリクエストだけを表示する

実行には端末での確認（y/N）が必要です。人が内容を読んでから実行してください。`;

export function parseConfig(argv: string[]): RecordConfig {
  let parsed: ReturnType<typeof parseRaw>;
  try {
    parsed = parseRaw(argv);
  } catch (error) {
    throw new ConfigError(error instanceof Error ? error.message : String(error));
  }
  const { values } = parsed;
  const help = values.help === true;
  const dryRun = values['dry-run'] === true;
  const outDir = values.out ?? DEFAULT_OUT_DIR;

  if (help) {
    return { user: '', maxPages: DEFAULT_MAX_PAGES, noteKeys: [], outDir, dryRun, help };
  }

  const user = values.user;
  if (user === undefined || !USER_RE.test(user)) {
    throw new ConfigError('--user に英数字・_・- からなるユーザー名を指定してください');
  }

  let maxPages = DEFAULT_MAX_PAGES;
  if (values['max-pages'] !== undefined) {
    maxPages = Number(values['max-pages']);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES_LIMIT) {
      throw new ConfigError(`--max-pages は 1〜${MAX_PAGES_LIMIT} の整数で指定してください`);
    }
  }

  const noteKeys =
    values.notes === undefined
      ? []
      : values.notes
          .split(',')
          .map((key) => key.trim())
          .filter((key) => key !== '');
  if (noteKeys.length > MAX_NOTES_LIMIT) {
    throw new ConfigError(`--notes は最大 ${MAX_NOTES_LIMIT} 件までです`);
  }
  for (const key of noteKeys) {
    if (!NOTE_KEY_RE.test(key)) {
      throw new ConfigError(`記事キーの形式が不正です: ${key}`);
    }
  }

  if (outDir.trim() === '') {
    throw new ConfigError('--out に空でないパスを指定してください');
  }

  return { user, maxPages, noteKeys: [...new Set(noteKeys)], outDir, dryRun, help };
}

function parseRaw(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      user: { type: 'string' },
      'max-pages': { type: 'string' },
      notes: { type: 'string' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export type RequestKind = 'contents' | 'note' | 'rss';

export interface PlannedRequest {
  kind: RequestKind;
  url: string;
  /** outDir からの相対パス */
  file: string;
}

export function contentsRequest(user: string, page: number): PlannedRequest {
  return {
    kind: 'contents',
    url: `${NOTE_ORIGIN}/api/v2/creators/${encodeURIComponent(user)}/contents?kind=note&page=${page}`,
    file: `contents/page-${page}.json`,
  };
}

export function noteRequest(key: string): PlannedRequest {
  return {
    kind: 'note',
    url: `${NOTE_ORIGIN}/api/v3/notes/${encodeURIComponent(key)}`,
    file: `notes/${key}.json`,
  };
}

export function rssRequest(user: string): PlannedRequest {
  return {
    kind: 'rss',
    url: `${NOTE_ORIGIN}/${encodeURIComponent(user)}/rss`,
    file: 'rss/feed.xml',
  };
}

/** 送信直前に呼び、note.com 以外・https 以外への送信を防ぐ */
export function assertNoteUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== NOTE_HOST) {
    throw new Error(`note.com 以外へのリクエストは許可していません: ${url}`);
  }
}

// ---------------------------------------------------------------------------
// レスポンスの読み取り（構造を仮定しすぎないよう、すべて防御的に読む）
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function contentsItems(json: unknown): Record<string, unknown>[] {
  const contents = asRecord(asRecord(json)?.data)?.contents;
  if (!Array.isArray(contents)) return [];
  return contents.map(asRecord).filter((item) => item !== undefined);
}

/** 次のページを取りに行くべきか。形が想定と違えば止める（取りすぎない側に倒す） */
export function shouldFetchNextPage(json: unknown): boolean {
  const data = asRecord(asRecord(json)?.data);
  if (data === undefined) return false;
  if (data.isLastPage === true) return false;
  return contentsItems(json).length > 0;
}

/**
 * contents の1ページ目から本文取得用の記事キーを選ぶ。
 * 無料記事（price が正でない）と有料記事（price が正）を1件ずつ。見つからなければその分は省く。
 */
export function pickNoteKeys(json: unknown): string[] {
  const items = contentsItems(json).filter((item) => typeof item.key === 'string' && NOTE_KEY_RE.test(item.key));
  const isPaid = (item: Record<string, unknown>) => typeof item.price === 'number' && item.price > 0;
  const free = items.find((item) => !isPaid(item));
  const paid = items.find(isPaid);
  return [free, paid].filter((item) => item !== undefined).map((item) => item.key as string);
}

// ---------------------------------------------------------------------------
// 保存前の不要な項目の除去
// ---------------------------------------------------------------------------

/** キー名をトークンに分ける（camelCase・snake_case・kebab-case に対応） */
export function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '');
}

/** このトークンを1つでも含むキーは値ごと削除する */
const SENSITIVE_TOKENS = new Set([
  'email',
  'mail',
  'phone',
  'password',
  'passwd',
  'secret',
  'token',
  'session',
  'cookie',
  'csrf',
  'birthday',
  'birthdate',
]);

/** この並びのトークンを含むキーも削除する */
const SENSITIVE_TOKEN_SEQUENCES: string[][] = [
  ['ip', 'address'],
  ['real', 'name'],
  ['access', 'key'],
  ['tel', 'number'],
];

/**
 * 他のユーザーの情報が入りうる一覧。正規化したキー名（トークンを _ で連結）と完全一致したら削除する。
 * 実レスポンスのキー名は未確認のため、ここは推測を含む。除去結果は manifest で人が確認する。
 */
const OTHER_USER_COLLECTIONS = new Set([
  // 実レスポンス（2026-11-12 取得）で確認したキー。この時点では空配列だった
  'likes',
  'content_raters',
  // 以下は未確認（推測）
  'likers',
  'like_users',
  'liked_users',
  'recent_likers',
  'comments',
  'followers',
  'followings',
  'supporters',
]);

export function isSensitiveKey(key: string): boolean {
  const tokens = keyTokens(key);
  if (tokens.some((token) => SENSITIVE_TOKENS.has(token))) return true;
  if (OTHER_USER_COLLECTIONS.has(tokens.join('_'))) return true;
  return SENSITIVE_TOKEN_SEQUENCES.some((sequence) =>
    tokens.some((_, i) => sequence.every((part, j) => tokens[i + j] === part)),
  );
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const REDACTED_EMAIL = '[redacted-email]';

export function redactEmails(text: string): { text: string; count: number } {
  let count = 0;
  const replaced = text.replace(EMAIL_RE, () => {
    count += 1;
    return REDACTED_EMAIL;
  });
  return { text: replaced, count };
}

export interface StripResult {
  value: unknown;
  /** 削除したキーの JSON パス（例: $.data.user.email） */
  removedKeys: string[];
  /** メールアドレスを伏せた文字列の JSON パス */
  redactedPaths: string[];
}

/** JSON を再帰的にたどり、機微なキーを削除し、文字列中のメールアドレスを伏せる */
export function stripSensitive(input: unknown): StripResult {
  const removedKeys: string[] = [];
  const redactedPaths: string[] = [];

  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') {
      const { text, count } = redactEmails(value);
      if (count > 0) redactedPaths.push(path);
      return text;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => walk(item, `${path}[${i}]`));
    }
    const record = asRecord(value);
    if (record === undefined) return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      const childPath = `${path}.${key}`;
      if (isSensitiveKey(key)) {
        removedKeys.push(childPath);
        continue;
      }
      out[key] = walk(child, childPath);
    }
    return out;
  };

  return { value: walk(input, '$'), removedKeys, redactedPaths };
}

// ---------------------------------------------------------------------------
// 取得間隔
// ---------------------------------------------------------------------------

/** 前回の送信からの経過時間を見て、次に送るまで待つべきミリ秒を返す */
export function waitBeforeNext(lastSentAt: number | undefined, now: number, minIntervalMs = MIN_INTERVAL_MS): number {
  if (lastSentAt === undefined) return 0;
  return Math.max(0, lastSentAt + minIntervalMs - now);
}
