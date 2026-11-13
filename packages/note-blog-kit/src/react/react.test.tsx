import { readdirSync, readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoteArticleCard, NoteArticleList, NotePagination } from './index.js';
import { FREE_KEY, findArticle, loadArticles } from './test-fixtures.js';

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

  it('実装コードは zod・sanitize-html・/server・テスト用の fixture を import しない', () => {
    const dir = new URL('./', import.meta.url);
    const sources = readdirSync(dir).filter(
      (name) => /\.(ts|tsx)$/.test(name) && !/\.test(-d)?\.(ts|tsx)$/.test(name) && name !== 'test-fixtures.ts',
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const code = readFileSync(new URL(name, dir), 'utf8');
      const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
      for (const specifier of imports) {
        expect(specifier, `${name} が ${specifier} を import している`).not.toMatch(
          /^(zod|sanitize-html)$|\/server\/|^\.\.\/server|test-fixtures/,
        );
      }
    }
  });
});
