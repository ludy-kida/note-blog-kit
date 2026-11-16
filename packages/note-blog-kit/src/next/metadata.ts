import type { NoteArticle, NoteArticleSummary } from '../core/types.js';
import { safeHttpUrl } from '../react/safe-url.js';

/** OG 画像 */
export interface NoteMetadataImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * {@link generateNoteMetadata} の戻り値。Next.js の `Metadata` にそのまま代入できる形
 * （`next` を依存に加えないため、型は自前で定義している）。
 */
export interface NoteMetadata {
  title: string;
  description: string;
  alternates: { canonical: string };
  openGraph: {
    type: 'article';
    title: string;
    description: string;
    url: string;
    publishedTime: string;
    /** 見出し画像（https のときだけ） */
    images?: NoteMetadataImage[];
  };
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
 * @example
 * ```ts
 * export async function generateMetadata({ params }) {
 *   const article = await getArticle({ key: (await params).key });
 *   return generateNoteMetadata(article, { formatTitle: (title) => `${title} | ブログ` });
 * }
 * ```
 */
export function generateNoteMetadata(
  article: NoteArticle | NoteArticleSummary,
  options: GenerateNoteMetadataOptions = {},
): NoteMetadata {
  const title = options.formatTitle ? options.formatTitle(article.title) : article.title;
  const canonical = options.canonical ?? article.url;
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
