/**
 * ルートの README.md から、npm に載せる packages/note-blog-kit/README.md を作る。
 * - 「## 開発」の節（リポジトリを触る人向け）を除く
 * - リポジトリ内への相対リンクを GitHub の絶対 URL にする（npm のページではリンクが切れるため）
 */
export const REPO_URL = 'https://github.com/ludy-kida/note-blog-kit';

/** @param {string} rootReadme */
export function toPackageReadme(rootReadme) {
  // 「## 開発」から次の「## 」の直前までを除く
  const withoutDev = rootReadme.replace(/^## 開発\n[\s\S]*?(?=^## )/m, '');
  return (
    withoutDev
      // 開発の節への案内を外す
      .replaceAll('（下の「開発」を参照）', '')
      // 相対リンク（http(s)・#・mailto 以外）を GitHub の URL にする
      .replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, path) => {
        const clean = String(path).replace(/^\.\//, '');
        const kind = /\.[a-z0-9]+$/i.test(clean) ? 'blob' : 'tree';
        return `](${REPO_URL}/${kind}/main/${clean})`;
      })
  );
}
