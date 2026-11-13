import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoteArticleCard, NoteArticleList, NotePagination } from './index.js';
import { FREE_KEY, findArticle, loadArticles } from './test-fixtures.js';

/** ディレクトリ以下の実装ファイル（テストとテスト用の fixture を除く）を再帰的に集める */
function collectSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return collectSources(path);
    const isSource = /\.(ts|tsx)$/.test(name) && !/\.test(-d)?\.(ts|tsx)$/.test(name);
    return isSource && name !== 'test-fixtures.ts' ? [path] : [];
  });
}

describe('note-blog-kit/react', () => {
  it('Server Component としてフックなしで HTML に描画できる', () => {
    const html = renderToString(
      <>
        <NoteArticleCard article={findArticle(FREE_KEY)} />
        <NoteArticleList articles={loadArticles(1)} />
        <NotePagination page={1} isLastPage={false} totalCount={237} getHref={(page) => `/?page=${page}`} />
      </>,
    );
    expect(html).toContain('class="nbk-card"');
    expect(html).toContain('class="nbk-article-list"');
    expect(html).toContain('class="nbk-pagination"');
  });

  /*
   * ビルド結果（dist/react/index.js）ではなくソースの import を検査する。
   * pnpm check はビルドより前にテストを走らせるため。ビルド結果の大きさは size-limit が別に見ている。
   */
  it('実装コードは react 以外を import しない（zod・sanitize-html・/server・fixture を含まない）', () => {
    const sources = collectSources(fileURLToPath(new URL('./', import.meta.url)));
    expect(sources.length).toBeGreaterThan(0);
    for (const path of sources) {
      const code = readFileSync(path, 'utf8');
      const specifiers = [
        ...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g),
        ...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((match) => match[1] ?? '');
      for (const specifier of specifiers) {
        const allowed = specifier === 'react' || specifier.startsWith('./') || specifier === '../core/types.js';
        expect(allowed, `${path} が ${specifier} を import している`).toBe(true);
      }
    }
  });
});
