import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', '.claude/hooks/*.test.mjs'],
    typecheck: {
      enabled: true,
      include: ['packages/*/src/**/*.test-d.ts'],
      tsconfig: 'packages/note-blog-kit/tsconfig.json',
    },
    coverage: {
      provider: 'v8',
      include: ['packages/note-blog-kit/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.test-d.ts', '**/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        'packages/note-blog-kit/src/core/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
});
