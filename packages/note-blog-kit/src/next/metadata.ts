import type { NoteArticle, NoteArticleSummary } from '../core/types.js';
import { safeHttpUrl } from '../react/safe-url.js';

/** OG 画像 */
export interface NoteMetadataImage {
  /** 画像 URL（https） */
  url: string;
  /** 幅（px）。見出し画像の幅がわかるとき */
  width?: number;
  /** 高さ（px）。見出し画像の高さがわかるとき */
  height?: number;
  /** 代替テキスト。見出し画像の alt が空でないとき */
  alt?: string;
}

/**
 * {@link generateNoteMetadata} の戻り値。Next.js の `Metadata` にそのまま代入できる形
 * （`next` を依存に加えないため、型は自前で定義している。代入できることは examples/next の型チェックで確かめている）。
 */
export interface NoteMetadata {
  /** タイトル（`formatTitle` を適用した後の値） */
  title: string;
  /** 説明（記事の抜粋 `excerpt`） */
  description: string;
  /** canonical。既定は `article.url`（note の元 URL） */
  alternates: { canonical: string };
  /** Open Graph。`url` は canonical と同じ */
  openGraph: {
    type: 'article';
    title: string;
    description: string;
    url: string;
    publishedTime: string;
    /** 見出し画像（https のときだけ） */
    images?: NoteMetadataImage[];
  };
  /** Twitter（X）カード */
  twitter: {
    /** 見出し画像があれば `summary_large_image`、なければ `summary` */
    card: 'summary_large_image' | 'summary';
    title: string;
    description: string;
    images?: string[];
  };
}

/** {@link generateNoteMetadata} のオプション */
export interface GenerateNoteMetadataOptions {
  /**
   * canonical（と og:url）。既定は `article.url`（note の元 URL）。
   * 自分のサイトの URL を正にしたい場合に渡す。渡した値はそのまま使うため、信頼できる値を渡すこと
   */
  canonical?: string;
  /** タイトルの加工（例：`(title) => \`${title} | ブログ\``）。OG・Twitter のタイトルにも使う。既定はそのまま */
  formatTitle?: (title: string) => string;
}

function httpsOnly(url: string | null | undefined): string | null {
  const safe = safeHttpUrl(url);
  return safe !== null && /^https:\/\//i.test(safe) ? safe : null;
}

function toImage(article: NoteArticle | NoteArticleSummary): NoteMetadataImage | null {
  const eyecatch = 'eyecatch' in article ? article.eyecatch : null;
  if (eyecatch) {
    const url = httpsOnly(eyecatch.url);
    if (url === null) return null;
    const image: NoteMetadataImage = { url };
    if (eyecatch.width !== null) image.width = eyecatch.width;
    if (eyecatch.height !== null) image.height = eyecatch.height;
    if (eyecatch.alt !== '') image.alt = eyecatch.alt;
    return image;
  }
  const url = httpsOnly(article.eyecatchUrl);
  return url === null ? null : { url };
}

/**
 * 記事の詳細ページの metadata を作る（Next.js App Router の `generateMetadata` から返す）。
 * canonical の既定値は note の元 URL（検索エンジンに note の記事を正として扱わせ、重複コンテンツを避ける）。
 *
 * @throws {TypeError} `canonical` を渡さず、`article.url` が https の URL でないとき
 *
 * @example
 * ```ts
 * export async function generateMetadata({ params }) {
 *   // user にない著者の記事は NoteNotFoundError になる（実際にはキャッシュも使う）
 *   const article = await getArticle({ key: (await params).key, user: 'your_urlname' });
 *   return generateNoteMetadata(article, { formatTitle: (title) => `${title} | ブログ` });
 * }
 * ```
 */
export function generateNoteMetadata(
  article: NoteArticle | NoteArticleSummary,
  options: GenerateNoteMetadataOptions = {},
): NoteMetadata {
  const title = options.formatTitle ? options.formatTitle(article.title) : article.title;
  const canonical = options.canonical ?? httpsOnly(article.url);
  // 既定値（記事 URL）が https でない記事は、正規化を通っていないデータ。canonical を汚さないよう失敗させる
  if (canonical === null) throw new TypeError(`article.url must be an https URL: ${JSON.stringify(article.url)}`);
  const image = toImage(article);
  const openGraph: NoteMetadata['openGraph'] = {
    type: 'article',
    title,
    description: article.excerpt,
    url: canonical,
    publishedTime: article.publishedAt,
  };
  const twitter: NoteMetadata['twitter'] = {
    card: image ? 'summary_large_image' : 'summary',
    title,
    description: article.excerpt,
  };
  if (image) {
    openGraph.images = [image];
    twitter.images = [image.url];
  }
  return { title, description: article.excerpt, alternates: { canonical }, openGraph, twitter };
}
