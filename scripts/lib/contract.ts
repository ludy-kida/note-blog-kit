/**
 * 契約テスト（note の API・RSS の形が変わっていないか）の照合と報告。
 *
 * 取得はライブラリの関数（zod の正規化）に任せ、ここでは結果を分類して Markdown にするだけ。
 * テストでは fixture を返すモックの fetch を渡す（note.com にはアクセスしない）。
 * 実データでの実行は GitHub Actions（.github/workflows/contract.yml）だけが行う。
 */

/** 失敗の種類。transient だけは一時的なものとして扱い、Issue を作らない */
export type ContractFailureKind = 'schema' | 'not-found' | 'http' | 'transient' | 'unexpected';

export interface ContractIssue {
  path: string;
  message: string;
}

export interface ContractCheck {
  name: string;
  status: 'ok' | 'failed' | 'skipped';
  kind?: ContractFailureKind;
  /** NoteErrorCode（ライブラリ以外の例外では undefined） */
  code?: string;
  httpStatus?: number;
  issues?: ContractIssue[];
  /** skipped の理由など（固定の文言だけを入れる。応答の中身は入れない） */
  note?: string;
}

export interface ContractResult {
  /** 形の変化も一時的な失敗もない */
  ok: boolean;
  checks: ContractCheck[];
}

interface ArticleLike {
  key: string;
  price: number | null;
}

/** 取得関数（ライブラリの listArticles・getArticle に取得オプションを束ねたもの） */
export interface ContractDeps {
  user: string;
  listArticles(options: { user: string; page?: number; source?: 'api' | 'rss' }): Promise<{
    articles: readonly ArticleLike[];
  }>;
  getArticle(options: { key: string }): Promise<unknown>;
}

export const CHECK_NAMES = {
  list: '一覧 API（1ページ目）',
  body: '記事本文 API（一覧の先頭の無料記事）',
  rss: 'RSS',
} as const;

const MAX_ISSUES = 50;

function classify(name: string, error: unknown): ContractCheck {
  const { code, status, issues } = (error ?? {}) as { code?: unknown; status?: unknown; issues?: unknown };
  const failed = { name, status: 'failed' as const };
  switch (code) {
    case 'NOTE_SCHEMA_ERROR':
      return {
        ...failed,
        kind: 'schema',
        code,
        issues: Array.isArray(issues)
          ? issues.map((issue: { path?: unknown; message?: unknown }) => ({
              path: String(issue?.path ?? ''),
              message: String(issue?.message ?? ''),
            }))
          : [],
      };
    case 'NOTE_NOT_FOUND':
      return { ...failed, kind: 'not-found', code, httpStatus: 404 };
    case 'NOTE_HTTP_ERROR': {
      const httpStatus = typeof status === 'number' ? status : undefined;
      const transient = httpStatus === undefined || httpStatus >= 500 || httpStatus === 429;
      return { ...failed, kind: transient ? 'transient' : 'http', code, ...(httpStatus ? { httpStatus } : {}) };
    }
    case 'NOTE_NETWORK_ERROR':
    case 'NOTE_TIMEOUT':
      return { ...failed, kind: 'transient', code };
    default:
      return { ...failed, kind: 'unexpected' };
  }
}

/**
 * 一覧 API の1ページ目 → 一覧の先頭の無料記事の本文 → RSS の順に、最大3リクエストで確かめる。
 * 失敗しても続けるが、一覧が取れなければ本文は飛ばす。再試行はしない。
 */
export async function runContractCheck(deps: ContractDeps): Promise<ContractResult> {
  const checks: ContractCheck[] = [];
  let freeKey: string | undefined;
  let listOk = false;

  try {
    const page = await deps.listArticles({ user: deps.user, page: 1, source: 'api' });
    listOk = true;
    freeKey = page.articles.find((article) => article.price === 0)?.key;
    checks.push({ name: CHECK_NAMES.list, status: 'ok' });
  } catch (error) {
    checks.push(classify(CHECK_NAMES.list, error));
  }

  if (freeKey === undefined) {
    checks.push({
      name: CHECK_NAMES.body,
      status: 'skipped',
      note: listOk ? '一覧の1ページ目に無料記事がない' : '一覧が取れなかった',
    });
  } else {
    try {
      await deps.getArticle({ key: freeKey });
      checks.push({ name: CHECK_NAMES.body, status: 'ok' });
    } catch (error) {
      checks.push(classify(CHECK_NAMES.body, error));
    }
  }

  try {
    await deps.listArticles({ user: deps.user, source: 'rss' });
    checks.push({ name: CHECK_NAMES.rss, status: 'ok' });
  } catch (error) {
    checks.push(classify(CHECK_NAMES.rss, error));
  }

  return { ok: checks.every((check) => check.status !== 'failed'), checks };
}

/** 0：問題なし／1：形の変化（Issue を作る）／2：一時的な失敗だけ（Issue は作らない） */
export function exitCodeOf(result: ContractResult): 0 | 1 | 2 {
  const failed = result.checks.filter((check) => check.status === 'failed');
  if (failed.length === 0) return 0;
  return failed.some((check) => check.kind !== 'transient') ? 1 : 2;
}

const KIND_LABELS: Record<ContractFailureKind, string> = {
  schema: '形の変化（キーが消えた・型が変わった）',
  'not-found': '見つからない（エンドポイントがなくなった可能性）',
  http: 'HTTP エラー（API の変更の可能性）',
  transient: '一時的な失敗（翌日また確かめる）',
  unexpected: '想定外の例外',
};

/** コードブロックの中に入れる文字列から、ブロックを閉じうる ` と改行を取り除く */
function inFence(text: string): string {
  return text.replace(/[`\r\n]+/g, ' ').slice(0, 300);
}

function resultCell(check: ContractCheck): string {
  if (check.status === 'ok') return '✅ 成功';
  if (check.status === 'skipped') return `⏭️ 飛ばした（${check.note ?? ''}）`;
  const detail = [check.code, check.httpStatus].filter((part) => part !== undefined).join(' ');
  return `❌ ${KIND_LABELS[check.kind ?? 'unexpected']}${detail ? ` \`${detail}\`` : ''}`;
}

/**
 * Issue の本文・Actions の Summary に使う Markdown。
 * 応答の中身（URL・本文・エラーメッセージ）は入れず、確認の名前・エラーコード・HTTP ステータス・zod の path と message だけを出す。
 * path と message は note の応答のキー名を含みうるので、コードブロックの中にだけ置く。
 */
export function formatReport(result: ContractResult, now: Date): string {
  const lines = [
    '## note の契約テストの結果',
    '',
    `実行日時（UTC）: ${now.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    '',
    '| 確認 | 結果 |',
    '| --- | --- |',
    ...result.checks.map((check) => `| ${check.name} | ${resultCell(check)} |`),
  ];
  for (const check of result.checks) {
    if (!check.issues?.length) continue;
    const shown = check.issues.slice(0, MAX_ISSUES);
    lines.push('', `### ${check.name}：zod の検証エラー（path: message）`, '', '```text');
    for (const issue of shown) lines.push(`${inFence(issue.path) || '(root)'}: ${inFence(issue.message)}`);
    if (check.issues.length > shown.length) lines.push(`…ほか ${check.issues.length - shown.length} 件`);
    lines.push('```');
  }
  return `${lines.join('\n')}\n`;
}
