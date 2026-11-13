import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_URL, toPackageReadme } from './package-readme.mjs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('toPackageReadme', () => {
  it('「## 開発」の節を除き、次の節は残す', () => {
    const result = toPackageReadme('# t\n\n## 使い方\n\nA\n\n## 開発\n\nB\n\n## ライセンス\n\nMIT\n');
    expect(result).toBe('# t\n\n## 使い方\n\nA\n\n## ライセンス\n\nMIT\n');
  });

  it('相対リンクを GitHub の URL にし、絶対 URL とページ内リンクはそのまま', () => {
    const result = toPackageReadme(
      '[a](examples/next) [b](fixtures/README.md) [c](./CLAUDE.md) [d](https://example.com) [e](#top)',
    );
    expect(result).toBe(
      `[a](${REPO_URL}/tree/main/examples/next) [b](${REPO_URL}/blob/main/fixtures/README.md) ` +
        `[c](${REPO_URL}/blob/main/CLAUDE.md) [d](https://example.com) [e](#top)`,
    );
  });

  it('packages/note-blog-kit/README.md はルートの README.md から作ったものと一致する（違えば pnpm readme:sync）', () => {
    const expected = toPackageReadme(read('../../README.md'));
    expect(read('../../packages/note-blog-kit/README.md')).toBe(expected);
    expect(expected).not.toContain('## 開発');
    expect(expected).not.toMatch(/\]\((?!https?:|#|mailto:)/);
  });
});
