#!/usr/bin/env node
/**
 * subpath exports ごとに api-extractor を実行し、公開 API レポートを etc/ に出力する。
 *
 *   node scripts/run-api-extractor.mjs           レポートを更新する（ローカル）
 *   node scripts/run-api-extractor.mjs --check   レポートと差分があれば失敗する（CI）
 *
 * 事前に `pnpm build` で dist/*.d.ts を作っておくこと。
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'packages/note-blog-kit');
const check = process.argv.includes('--check');

/** [subpath, dist の d.ts, レポート名] */
const ENTRIES = [
  ['.', 'dist/index.d.ts', 'note-blog-kit'],
  ['./server', 'dist/server/index.d.ts', 'note-blog-kit-server'],
  ['./react', 'dist/react/index.d.ts', 'note-blog-kit-react'],
  ['./next', 'dist/next/index.d.ts', 'note-blog-kit-next'],
];

let failed = false;
for (const [subpath, dts, reportName] of ENTRIES) {
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: pkgDir,
      mainEntryPointFilePath: join(pkgDir, dts),
      compiler: { tsconfigFilePath: join(pkgDir, 'tsconfig.json') },
      apiReport: {
        enabled: true,
        reportFolder: join(root, 'etc'),
        reportTempFolder: join(pkgDir, 'temp'),
        reportFileName: reportName,
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      messages: {
        extractorMessageReporting: {
          default: { logLevel: 'warning' },
          // 公開型の各メンバーにリリースタグ（@public 等）を付ける運用はしない
          'ae-missing-release-tag': { logLevel: 'none' },
          // 公開型のコメントは TSDoc で書くが、全メンバーへの記述は必須にしない
          'ae-undocumented': { logLevel: 'none' },
        },
      },
    },
    configObjectFullPath: join(pkgDir, 'api-extractor.json'),
    packageJsonFullPath: join(pkgDir, 'package.json'),
  });

  const result = Extractor.invoke(config, { localBuild: !check, showVerboseMessages: false });
  if (result.succeeded) {
    console.log(`api-extractor: ${subpath} OK`);
  } else {
    failed = true;
    console.error(
      `api-extractor: ${subpath} 失敗（errors ${result.errorCount}, warnings ${result.warningCount}）` +
        (result.apiReportChanged
          ? ' — 公開 API が変わっています。`pnpm api` で etc/ を更新し、PR に明記してください'
          : ''),
    );
  }
}

process.exitCode = failed ? 1 : 0;
