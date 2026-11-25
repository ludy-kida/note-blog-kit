// ESM のみの配布物を CommonJS の require() で読めるか確かめる（Node.js 22.12 以降の require(esm)）
'use strict';

for (const id of ['note-blog-kit', 'note-blog-kit/server', 'note-blog-kit/react', 'note-blog-kit/next']) {
  const mod = require(id);
  if (typeof mod !== 'object' || mod === null) throw new Error(`require('${id}') did not return a module`);
}
console.log('require(esm): OK');
