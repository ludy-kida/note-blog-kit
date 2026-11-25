import type { ComponentType, ReactElement, ReactNode } from 'react';
import { DIGITS, IMAGE_PREFIX, SAFE_VALUE, VISIBLE_TEXT } from '../core/body-policy.js';
import type { NoteArticle, NoteEmbed, NoteTocItem } from '../core/types.js';
import { type BodyElement, type BodyNode, parseBody } from './body/parse.js';
import { classNames } from './class-names.js';
import { safeHttpUrl } from './safe-url.js';
import type { NoteLinkComponent } from './types.js';

/** 本文の画像を置き換えるコンポーネントの props */
export interface NoteBodyImageProps {
  /** 画像 URL（note の CDN の https の URL だけが渡される） */
  src: string;
  /** 代替テキスト（空文字は装飾画像） */
  alt: string;
  /** 幅（px）。本文の値が数字だけのときに渡る */
  width?: number;
  /** 高さ（px）。本文の値が数字だけのときに渡る */
  height?: number;
}

/** 本文の見出しを置き換えるコンポーネントの props */
export interface NoteBodyHeadingProps {
  /** 見出しのレベル（本文に出るのは h2〜h4。{@link NoteHeadingLevel} とは別） */
  level: 2 | 3 | 4;
  /** 目次のリンク先になる id（nbk- から始まる） */
  id?: string;
  /** 見出しの中身 */
  children?: ReactNode;
}

/** 本文の埋め込みを置き換えるコンポーネントの props */
export interface NoteBodyEmbedProps {
  /** `article.embeds` の中で key が一致するもの。見つからないとき、URL が https でないとき、種類に許可しない文字があるときは null */
  embed: NoteEmbed | null;
  /** 埋め込みの種類（`note`・`external-article` など） */
  service: NoteEmbed['service'];
  /** 既定の中身（外部記事ならリンクカード。note の埋め込みは空） */
  children?: ReactNode;
}

/** 目次（本文中の目次の位置）を置き換えるコンポーネントの props */
export interface NoteBodyTocProps {
  /** `article.toc`（有料記事では有料部分の見出しも含む） */
  items: NoteTocItem[];
  /** 本文に見出しがある項目の id（ページ内リンクにできるもの） */
  linkableIds: string[];
  /** 見出しの文言（`labels.toc`、既定は「目次」） */
  title: ReactNode;
}

/** {@link NoteArticleBody} で置き換えられる要素 */
export interface NoteBodyComponents {
  /** 画像。置き換えると既定のクラス名と遅延読み込み（loading・decoding）は付かない */
  img?: ComponentType<NoteBodyImageProps>;
  /** 見出し（h2〜h4）。置き換えると既定のクラス名は付かない */
  heading?: ComponentType<NoteBodyHeadingProps>;
  /** 埋め込み（note の記事・外部記事など） */
  embed?: ComponentType<NoteBodyEmbedProps>;
  /** 本文中の目次の位置に出すもの */
  toc?: ComponentType<NoteBodyTocProps>;
}

/** {@link NoteArticleBody} の props */
export interface NoteArticleBodyProps {
  /** 表示する記事（`getArticle` で取得したもの） */
  article: NoteArticle;
  /** 本文の要素を任意のコンポーネントに置き換える */
  components?: NoteBodyComponents;
  /**
   * 「続きは note で」のリンク先。既定は `article.url`（http(s) でなければ出さない）。`isPartial` でなければ使わない。
   * 利用者が渡す値はそのまま `href` に入るため、信頼できない値（`javascript:` など）を渡さないこと。
   * React 18 はこうした値をブロックしない
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

function safeHttpsUrl(value: string | undefined): string | null {
  const url = safeHttpUrl(value);
  return url !== null && /^https:\/\//i.test(url) ? url : null;
}

function safeImageUrl(value: string | undefined): string | null {
  const url = safeHttpsUrl(value);
  return url?.toLowerCase().startsWith(IMAGE_PREFIX) ? url : null;
}

/** テキスト（空白以外）か、描画する画像を含むか（名前のないリンクを出さないため） */
function hasContent(nodes: BodyNode[]): boolean {
  return nodes.some((node) =>
    typeof node === 'string'
      ? VISIBLE_TEXT.test(node)
      : node.tag === 'img'
        ? safeImageUrl(node.attrs.src) !== null
        : hasContent(node.children),
  );
}

function collectIds(nodes: BodyNode[], ids: Set<string>): Set<string> {
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    if (node.attrs.id !== undefined && ID_RE.test(node.attrs.id)) ids.add(node.attrs.id);
    collectIds(node.children, ids);
  }
  return ids;
}

function DefaultToc({ items, title, linkableIds }: NoteBodyTocProps): ReactNode {
  if (items.length === 0) return null;
  const ids = new Set(linkableIds);
  // 手で組んだ toc に同じ id があっても key が重ならないよう、2回目以降は番号を付ける
  const seen = new Map<string, number>();
  const keyOf = (id: string) => {
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return count === 0 ? id : `${id}:${count}`;
  };
  return (
    <nav className="nbk-toc">
      <p className="nbk-toc__title">{title}</p>
      <ul className="nbk-toc__list">
        {items.map((item) => (
          <li
            key={keyOf(item.id)}
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
  const found = ctx.article.embeds.find((item) => item.key === embedKey);
  // components に渡す前に検証する（URL は https、種類は英数字と -_.:/ だけ）
  const embed =
    found !== undefined && safeHttpsUrl(found.url) !== null && SAFE_VALUE.test(found.service) ? found : null;
  const children = renderChildren(el.children, { ...ctx, inEmbed: true });
  const { embed: Embed } = ctx.components;
  if (Embed) {
    return (
      <Embed key={key} embed={embed} service={service}>
        {children}
      </Embed>
    );
  }
  const url = service === 'note' ? safeHttpsUrl(embed?.url ?? el.attrs['data-nbk-embed-url']) : null;
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
    if (!Object.hasOwn(attrs, 'data-nbk-toc')) return renderChildren(node.children, ctx);
    const Toc = ctx.components.toc ?? DefaultToc;
    const linkableIds = ctx.article.toc.filter((item) => ctx.ids.has(item.id)).map((item) => item.id);
    return <Toc key={key} items={ctx.article.toc} linkableIds={linkableIds} title={ctx.tocTitle} />;
  }
  const service = attrs['data-nbk-embed-service'];
  if (tag === 'figure' && service !== undefined && SAFE_VALUE.test(service)) return renderEmbed(node, ctx, key);
  if (tag === 'img') {
    const src = safeImageUrl(attrs.src);
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

  // テキストも画像もないリンクはタグを外す（/server と同じ。正規化を通らない本文のための保険）
  if (tag === 'a' && !hasContent(node.children)) return renderChildren(node.children, ctx);
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
    // target="_blank" には /server と同じく nofollow noopener noreferrer を付ける
    if (props.target !== undefined) {
      rel.push(...['nofollow', 'noopener', 'noreferrer'].filter((token) => !rel.includes(token)));
    }
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
