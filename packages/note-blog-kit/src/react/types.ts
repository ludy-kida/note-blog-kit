import type { ElementType, ReactNode } from 'react';

/**
 * リンクに使う要素。既定は `'a'`。
 * `href`・`className`・`children` を受け取るコンポーネント（Next.js の `Link` など）をそのまま渡せる。
 */
export type NoteLinkComponent = ElementType<{ href: string; className?: string; children?: ReactNode }>;
