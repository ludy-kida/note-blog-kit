import { type IterateArticlesOptions, listAllArticles } from '../server/iterate-articles.js';

/** {@link generateNoteStaticParams} のオプション */
export interface GenerateNoteStaticParamsOptions<P extends string = 'key'> extends IterateArticlesOptions {
  /** 動的セグメントの名前（`app/blog/[key]/page.tsx` なら `'key'`）。英数字・_・- のみ。既定は `'key'` */
  param?: P;
}

const PARAM_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 記事の詳細ページの `generateStaticParams` に返す値を作る（サーバー専用。ビルド時に呼ぶ）。
 * `listAllArticles` で記事を集めるため、1ページ（6件）ごとに1リクエストかかる。
 * `maxPages`（既定 20 ページ = 120件）で打ち切るので、それより古い記事はビルド時には生成しない。
 * `dynamicParams` を true（Next.js の既定）のままにしておけば、残りの記事も最初のアクセス時に表示できる。
 *
 * @example
 * ```ts
 * export const generateStaticParams = () => generateNoteStaticParams({ user: 'your_urlname' });
 * ```
 * @throws {TypeError} param・user・maxPages などが不正なとき
 */
export async function generateNoteStaticParams<P extends string = 'key'>(
  options: GenerateNoteStaticParamsOptions<P>,
): Promise<Record<P, string>[]> {
  const { param = 'key' as P, ...listOptions } = options;
  if (typeof param !== 'string' || !PARAM_RE.test(param)) {
    throw new TypeError(`param must be a dynamic segment name: ${JSON.stringify(param)}`);
  }
  const { articles } = await listAllArticles(listOptions);
  return articles.map((article) => ({ [param]: article.key }) as Record<P, string>);
}
