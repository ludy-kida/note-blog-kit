import type { ElementType, ReactNode } from 'react';

/**
 * リンクに使う要素。既定は `'a'`。
 * `href`（文字列）・`className`・`children` を受け取るコンポーネント（Next.js の `Link` など）をそのまま渡せる。
 *
 * Next.js の typedRoutes を有効にしている場合は `Link` の `href` が文字列を受け付けないため、
 * `({ href, ...props }) => <Link href={href as Route} {...props} />` のように包んだコンポーネントを渡す。
 */
export type NoteLinkComponent = ElementType<{ href: string; className?: string; children?: ReactNode }>;

/** 見出しのレベル（`h2`〜`h6`） */
export type NoteHeadingLevel = 2 | 3 | 4 | 5 | 6;
