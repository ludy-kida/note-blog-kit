// ESM のみの配布物を CommonJS の require() で読めるか確かめる（Node.js の require(esm)）
// 一覧（expected）は scripts/check-pack.mjs の ESM の確認でも使う
'use strict';

/** subpath ごとに、関数として読めるはずの代表的な export */
const expected = {
  'note-blog-kit': [],
  'note-blog-kit/server': ['listArticles', 'getArticle', 'NoteError'],
  'note-blog-kit/react': ['NoteArticleList', 'useNoteArticles'],
  'note-blog-kit/next': ['createNoteArticlesHandler', 'generateNoteMetadata'],
};

/** 読み込んだモジュールに、一覧の export が関数としてあるか確かめる */
function checkModule(id, mod, how) {
  if (typeof mod !== 'object' || mod === null) throw new Error(`${how}('${id}') did not return a module`);
  for (const name of expected[id]) {
    if (typeof mod[name] !== 'function') throw new Error(`${how}('${id}').${name} is not a function`);
  }
}

module.exports = { expected, checkModule };

if (require.main === module) {
  for (const id of Object.keys(expected)) checkModule(id, require(id), 'require');
  console.log('require(esm): OK');
}
