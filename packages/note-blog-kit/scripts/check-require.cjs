// ESM のみの配布物を CommonJS の require() で読めるか確かめる（Node.js の require(esm)）
'use strict';

/** subpath ごとに、関数として読めるはずの代表的な export */
const expected = {
  'note-blog-kit': [],
  'note-blog-kit/server': ['listArticles', 'getArticle', 'NoteError'],
  'note-blog-kit/react': ['NoteArticleList', 'useNoteArticles'],
  'note-blog-kit/next': ['createNoteArticlesHandler'],
};

for (const [id, names] of Object.entries(expected)) {
  const mod = require(id);
  if (typeof mod !== 'object' || mod === null) throw new Error(`require('${id}') did not return a module`);
  for (const name of names) {
    if (typeof mod[name] !== 'function') throw new Error(`require('${id}').${name} is not a function`);
  }
}
console.log('require(esm): OK');
