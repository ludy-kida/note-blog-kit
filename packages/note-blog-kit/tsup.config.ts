import { copyFile, mkdir } from 'node:fs/promises';
import { defineConfig } from 'tsup';

/** デフォルト CSS は加工せずに dist へ置く（任意で import 'note-blog-kit/styles.css' する） */
async function copyStyles(): Promise<void> {
  await mkdir('dist', { recursive: true });
  await copyFile('src/styles/styles.css', 'dist/styles.css');
}

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'server/index': 'src/server/index.ts',
      'react/index': 'src/react/index.ts',
      'next/index': 'src/next/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2022',
    treeshake: true,
    splitting: false,
    sourcemap: false,
    // clean の後に動くよう、clean するこの設定でコピーする（watch 中に styles.css を編集しても再コピーはされない）
    onSuccess: copyStyles,
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    clean: false,
  },
]);
