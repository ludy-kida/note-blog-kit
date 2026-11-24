/**
 * 契約テスト：note の実データ（自分のアカウントの公開情報）を最大3リクエストで取得し、
 * ライブラリの正規化（zod）で形が変わっていないか確かめる。
 *
 * 実行するのは GitHub Actions（.github/workflows/contract.yml）だけ。
 * エージェントは実行しない（note.com にアクセスするため。PreToolUse hook で止めている）。
 * 取得はビルド済みのライブラリで行う：Cookie なし・1秒間隔・再試行なし。
 *
 * 実行: pnpm build && node scripts/contract-check.ts --user <urlname> [--report <path>]
 * 終了コード: 0 問題なし／1 形の変化（Issue を作る）／2 一時的な失敗だけ／3 使い方の誤り
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { type ContractDeps, exitCodeOf, formatReport, runContractCheck } from './lib/contract.ts';

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TIMEOUT_MS = 15_000;
const MIN_INTERVAL_MS = 1_000;

interface ServerModule {
  listArticles: (options: Record<string, unknown>) => Promise<{ articles: { key: string; price: number | null }[] }>;
  getArticle: (options: Record<string, unknown>) => Promise<unknown>;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { user: { type: 'string' }, report: { type: 'string', default: 'contract-report.md' } },
    strict: true,
  });
  const user = values.user;
  if (user === undefined || !USER_RE.test(user)) {
    console.error('Usage: node scripts/contract-check.ts --user <urlname> [--report <path>]');
    return 3;
  }

  // 型の解決に dist を要求しないよう、パスは実行時に組み立てる
  const entry = new URL('../packages/note-blog-kit/dist/server/index.js', import.meta.url).href;
  const server = (await import(entry)) as ServerModule;
  const request = { timeoutMs: TIMEOUT_MS, minIntervalMs: MIN_INTERVAL_MS };
  const deps: ContractDeps = {
    user,
    listArticles: (options) => server.listArticles({ ...request, ...options }),
    getArticle: (options) => server.getArticle({ ...request, ...options }),
  };

  const result = await runContractCheck(deps);
  const report = formatReport(result, new Date());
  await writeFile(values.report, report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  return exitCodeOf(result);
}

process.exitCode = await main();
