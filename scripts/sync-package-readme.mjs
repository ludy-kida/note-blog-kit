#!/usr/bin/env node
/** ルートの README.md から packages/note-blog-kit/README.md を作り直す（`pnpm readme:sync`） */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPackageReadme } from './lib/package-readme.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
writeFileSync(join(root, 'packages/note-blog-kit/README.md'), toPackageReadme(readme));
console.log('packages/note-blog-kit/README.md を更新しました');
