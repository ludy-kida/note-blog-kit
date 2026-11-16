import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { NoteArticle, NoteEmbed, NoteTocItem } from '../core/types.js';
import { type BodyElement, type BodyNode, parseBody } from './body/parse.js';
import { classNames } from './class-names.js';
import { safeHttpUrl } from './safe-url.js';
import type { NoteLinkComponent } from './types.js';

/** 本文の画像を置き換えるコンポーネントの props */
export interface NoteBodyImageProps {
  /** 画像 URL（http(s) のものだけが渡される） */
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/** 本文の見出しを置き換えるコンポーネントの props */
export interface NoteBodyHeadingProps {
  level: 2 | 3 | 4;
  /** 目次のリンク先になる id（nbk- から始まる） */
  id?: string;
  children?: ReactNode;
}

/** 本文の埋め込みを置き換えるコンポーネントの props */
export interface NoteBodyEmbedProps {
  /** `article.embeds` の中で key が一致するもの。見つからなければ null */
  embed: NoteEmbed | null;
  /** 埋め込みの種類（`note`・`external-article` など） */
  service: string;
  /** 既定の中身（外部記事ならリンクカード。note の埋め込みは空） */
  children?: ReactNode;
}

/** 目次（本文中の目次の位置）を置き換えるコンポーネントの props */
export interface NoteBodyTocProps {
  items: NoteTocItem[];
}

/** {@link NoteArticleBody} で置き換えられる要素 */
export interface NoteBodyComponents {
  img?: ComponentType<NoteBodyImageProps>;
  heading?: ComponentType<NoteBodyHeadingProps>;
  embed?: ComponentType<NoteBodyEmbedProps>;
  toc?: ComponentType<NoteBodyTocProps>;
}

/** {@link NoteArticleBody} の props */
export interface NoteArticleBodyProps {
  /** 表示する記事（`getArticle` で取得したもの） */
  article: NoteArticle;
  /** 本文の要素を任意のコンポーネントに置き換える */
  components?: NoteBodyComponents;
  /**
   * 「続きは note で」のリンク先。既定は `article.url`（http(s) でなければ出さない）。
   * 利用者が渡す値はそのまま `href` に入るため、信頼できない値を渡さないこと
   */
  readMoreHref?: string;
  /** 「続きは note で」と note の埋め込みのリンクに使う要素。既定は `'a'` */
  linkComponent?: NoteLinkComponent;
  /** 文言の差し替え。既定は「続きは note で」「目次」 */
  labels?: { readMore?: ReactNode; toc?: ReactNode };
  /** 既定のクラス名（`nbk-body`）に追加するクラス名 */
  className?: string;
}

interface RenderContext {
  article: NoteArticle;
  components: NoteBodyComponents;
  Link: NoteLinkComponent;
  tocTitle: ReactNode;
  /** 本文にある見出しの id（目次のリンク先があるか） */
  ids: Set<string>;
  /** 埋め込みの中（リンクに nbk-embed__link を付ける） */
  inEmbed?: boolean;
}

const ID_RE = /^nbk-[A-Za-z0-9\-_.:/]+$/;
const DIGITS = /^\d+$/;
const REL_TOKENS = new Set(['nofollow', 'noopener', 'noreferrer', 'sponsored']);

/** 本文の要素に付けるクラス名（CSS はこのクラスだけに当て、サイトの他の要素に影響させない） */
const BODY_CLASS: Record<string, string> = {
  p: 'nbk-body__p',
  h2: 'nbk-body__h2',
  h3: 'nbk-body__h3',
  h4: 'nbk-body__h4',
  a: 'nbk-body__a',
  ul: 'nbk-body__ul',
  ol: 'nbk-body__ol',
  blockquote: 'nbk-body__blockquote',
  figure: 'nbk-body__figure',
  figcaption: 'nbk-body__figcaption',
  img: 'nbk-body__img',
  pre: 'nbk-body__pre',
  code: 'nbk-body__code',
  hr: 'nbk-body__hr',
  table: 'nbk-body__table',
  th: 'nbk-body__th',
  td: 'nbk-body__td',
};

function toNumber(value: string | undefined): number | undefined {
  return value !== undefined && DIGITS.test(value) ? Number(value) : undefined;
}

function safeHref(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^mailto:[^\s"<>]+$/i.test(value)) return safeHttpUrl(value);
  // 制御文字を含む値は、ブラウザが除去して別のスキームとして解釈しうるため受け付けない
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) < 0x20 || value.charCodeAt(i) === 0x7f) return null;
  }
  return value;
}

function collectIds(nodes: BodyNode[], ids: Set<string>): Set<string> {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    if (node.attrs.id !== undefined && ID_RE.test(node.attrs.id)) ids.add(node.attrs.id);
    collectIds(node.children, ids);
  }
  return ids;
}

function DefaultToc({ items, title, ids }: NoteBodyTocProps & { title: ReactNode; ids: Set<string> }): ReactNode {
  if (items.length === 0) return null;
  return (
    <nav className="nbk-toc">
      <p className="nbk-toc__title">{title}</p>
      <ul className="nbk-toc__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={item.level === 2 ? 'nbk-toc__item nbk-toc__item--h2' : 'nbk-toc__item nbk-toc__item--h3'}
          >
            {ids.has(item.id) ? (
              <a className="nbk-toc__link" href={`#${item.id}`}>
                {item.text}
              </a>
            ) : (
              item.text
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function renderChildren(nodes: BodyNode[], ctx: RenderContext): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, ctx, index));
}

function renderEmbed(el: BodyElement, ctx: RenderContext, key: number): ReactNode {
  const service = el.attrs['data-nbk-embed-service'] as string;
  const embedKey = el.attrs['data-nbk-embed-key'];
  const embed = ctx.article.embeds.find((item) => item.key === embedKey) ?? null;
  const children = renderChildren(el.children, { ...ctx, inEmbed: true });
  const { embed: Embed } = ctx.components;
  if (Embed) {
    return (
      <Embed key={key} embed={embed} service={service}>
        {children}
      </Embed>
    );
  }
  const url = service === 'note' ? safeHttpUrl(embed?.url ?? el.attrs['data-nbk-embed-url']) : null;
  const { Link } = ctx;
  return (
    <figure key={key} className="nbk-embed" data-service={service}>
      {url === null ? (
        children
      ) : (
        <Link href={url} className="nbk-embed__link">
          {url}
        </Link>
      )}
    </figure>
  );
}

function renderNode(node: BodyNode, ctx: RenderContext, key: number): ReactNode {
  if (typeof node === 'string') return node;
  const { tag, attrs } = node;
  const id = attrs.id !== undefined && ID_RE.test(attrs.id) ? attrs.id : undefined;

  if (tag === 'div') {
    if (!('data-nbk-toc' in attrs)) return renderChildren(node.children, ctx);
    const { toc: Toc } = ctx.components;
    return Toc ? (
      <Toc key={key} items={ctx.article.toc} />
    ) : (
      <DefaultToc key={key} items={ctx.article.toc} title={ctx.tocTitle} ids={ctx.ids} />
    );
  }
  if (tag === 'figure' && attrs['data-nbk-embed-service'] !== undefined) return renderEmbed(node, ctx, key);
  if (tag === 'img') {
    const src = safeHttpUrl(attrs.src);
    if (src === null) return null;
    const props: NoteBodyImageProps = { src, alt: attrs.alt ?? '' };
    const width = toNumber(attrs.width);
    const height = toNumber(attrs.height);
    if (width !== undefined) props.width = width;
    if (height !== undefined) props.height = height;
    const { img: Img } = ctx.components;
    return Img ? (
      <Img key={key} {...props} />
    ) : (
      <img
        key={key}
        className={BODY_CLASS.img}
        src={props.src}
        alt={props.alt}
        width={props.width}
        height={props.height}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const children = renderChildren(node.children, ctx);
  if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
    const { heading: Heading } = ctx.components;
    if (Heading) {
      const level = Number(tag[1]) as 2 | 3 | 4;
      return id === undefined ? (
        <Heading key={key} level={level}>
          {children}
        </Heading>
      ) : (
        <Heading key={key} level={level} id={id}>
          {children}
        </Heading>
      );
    }
  }

  const props: Record<string, string | number> = {};
  if (BODY_CLASS[tag] !== undefined) props.className = BODY_CLASS[tag];
  if (id !== undefined) props.id = id;
  if (tag === 'a') {
    if (ctx.inEmbed) props.className = 'nbk-embed__link';
    const href = safeHref(attrs.href);
    if (href !== null) props.href = href;
    if (attrs.target === '_blank') props.target = '_blank';
    const rel = (attrs.rel ?? '').split(/\s+/).filter((token) => REL_TOKENS.has(token));
    if (props.target !== undefined) rel.push(...['noopener', 'noreferrer'].filter((token) => !rel.includes(token)));
    if (rel.length > 0) props.rel = rel.join(' ');
  } else if (tag === 'th' || tag === 'td') {
    const colSpan = toNumber(attrs.colspan);
    const rowSpan = toNumber(attrs.rowspan);
    if (colSpan !== undefined) props.colSpan = colSpan;
    if (rowSpan !== undefined) props.rowSpan = rowSpan;
  }
  const Tag = tag as 'p';
  if (tag === 'br' || tag === 'hr') return <Tag key={key} {...props} />;
  return (
    <Tag key={key} {...props}>
      {children}
    </Tag>
  );
}

/**
 * 記事の本文。`getArticle` が返すサニタイズ済みの `bodyHtml` を React 要素として描画する
 * （`dangerouslySetInnerHTML` は使わず、ここでも許可したタグ・属性だけを描画する）。
 * 有料記事（`isPartial`）では、本文の後に「続きは note で」リンクを出す。
 * 見た目は持たず、`nbk-body` から始まるクラス名を付ける。フックを使わないため、Server Component としても使える。
 */
export function NoteArticleBody({
  article,
  components = {},
  readMoreHref,
  linkComponent: Link = 'a',
  labels,
  className,
}: NoteArticleBodyProps): ReactElement {
  const nodes = parseBody(article.bodyHtml);
  const ctx: RenderContext = {
    article,
    components,
    Link,
    tocTitle: labels?.toc ?? '目次',
    ids: collectIds(nodes, new Set()),
  };
  const moreHref = article.isPartial ? (readMoreHref ?? safeHttpUrl(article.url)) : null;
  return (
    <div className={classNames('nbk-body', className)}>
      {renderChildren(nodes, ctx)}
      {moreHref !== null && (
        <p className="nbk-body__more">
          <Link href={moreHref} className="nbk-body__more-link">
            {labels?.readMore ?? '続きは note で'}
          </Link>
        </p>
      )}
    </div>
  );
}
