/**
 * 本文 HTML のサニタイズ（許可リスト方式）。方針は docs/sanitize-policy.md。
 * この許可リストの変更は人の承認が必要（CLAUDE.md・CODEOWNERS）。
 *
 * 属性はまず transform で自前の規則に従って作り直し、そのうえで sanitize-html の
 * allowedTags・allowedAttributes・allowedSchemes でもう一度絞る（二重の関門）。
 */
import sanitizeHtml from 'sanitize-html';

/** 許可するタグ（div は目次の目印 `<div data-nbk-toc>` にだけ使う。本文の div はタグを消す） */
const ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'figure',
  'figcaption',
  'img',
  'pre',
  'code',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
];

/** 中身ごと消す要素 */
const DISCARD_WITH_CONTENT = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'noscript',
  'meta',
  'link',
  'base',
  'title',
  'xmp',
  'plaintext',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['id'],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  figure: ['data-nbk-embed-service', 'data-nbk-embed-key', 'data-nbk-embed-url'],
  div: ['data-nbk-toc'],
};

const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
const IMAGE_PREFIX = 'https://assets.st-note.com/';
const IMAGE_HOST = 'assets.st-note.com';
/** id・data-nbk-embed-*（URL を除く）に使える文字 */
export const SAFE_VALUE = /^[A-Za-z0-9\-_.:/]+$/;
const DIGITS = /^\d+$/;

const AMAZON_HOSTS = new Set(['amazon.co.jp', 'www.amazon.co.jp', 'amazon.com', 'www.amazon.com']);
const AFFILIATE_HOSTS = new Set([
  'amzn.to',
  'amzn.asia',
  'hb.afl.rakuten.co.jp',
  'af.moshimo.com',
  'px.a8.net',
  'ck.jp.ap.valuecommerce.com',
]);

/**
 * 属性値の URL を、ブラウザと同じように前後の空白・制御文字と途中のタブ・改行を除いてから絶対 URL として解釈する。
 * 実体参照はパーサーが解いた後の値が渡される。相対 URL・プロトコル相対 URL は解釈できないので undefined。
 */
function parseAbsoluteUrl(raw: string): { value: string; url: URL } | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: URL の前後の制御文字を除くため
  const value = raw.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  if (!URL.canParse(value)) return undefined;
  return { value, url: new URL(value) };
}

function isAffiliate(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (AFFILIATE_HOSTS.has(host)) return true;
  return AMAZON_HOSTS.has(host) && url.searchParams.has('tag');
}

type Attributes = Record<string, string>;

function transformLink(attribs: Attributes): Attributes {
  const out: Attributes = {};
  const parsed = attribs.href === undefined ? undefined : parseAbsoluteUrl(attribs.href);
  const href = parsed && LINK_SCHEMES.has(parsed.url.protocol) ? parsed : undefined;
  if (href) out.href = href.value;

  const blank = attribs.target?.trim().toLowerCase() === '_blank';
  if (blank) out.target = '_blank';

  const rel: string[] = [];
  if (blank) rel.push('nofollow', 'noopener', 'noreferrer');
  if (href && isAffiliate(href.url)) rel.push('sponsored');
  if (rel.length > 0) out.rel = rel.join(' ');
  return out;
}

/** 画像は assets.st-note.com のものだけ。それ以外は undefined（img ごと消す） */
function transformImage(attribs: Attributes): Attributes | undefined {
  const parsed = attribs.src === undefined ? undefined : parseAbsoluteUrl(attribs.src);
  if (
    !parsed ||
    parsed.url.protocol !== 'https:' ||
    parsed.url.host !== IMAGE_HOST ||
    parsed.url.username !== '' ||
    parsed.url.password !== '' ||
    !parsed.value.toLowerCase().startsWith(IMAGE_PREFIX)
  ) {
    return undefined;
  }
  const out: Attributes = { src: parsed.value };
  if (attribs.alt !== undefined) out.alt = attribs.alt;
  if (attribs.width !== undefined && DIGITS.test(attribs.width)) out.width = attribs.width;
  if (attribs.height !== undefined && DIGITS.test(attribs.height)) out.height = attribs.height;
  out.loading = 'lazy';
  out.decoding = 'async';
  return out;
}

function transformEmbed(attribs: Attributes, out: Attributes): void {
  const service = attribs['embedded-service'];
  if (service !== undefined && SAFE_VALUE.test(service)) out['data-nbk-embed-service'] = service;
  const key = attribs['embedded-content-key'];
  if (key !== undefined && SAFE_VALUE.test(key)) out['data-nbk-embed-key'] = key;
  const parsed = attribs['data-src'] === undefined ? undefined : parseAbsoluteUrl(attribs['data-src']);
  if (parsed && parsed.url.protocol === 'https:') out['data-nbk-embed-url'] = parsed.value;
}

function transform(tagName: string, attribs: Attributes): { tagName: string; attribs: Attributes } {
  if (tagName === 'table-of-contents') return { tagName: 'div', attribs: { 'data-nbk-toc': '' } };
  // 本文の div は属性を消し、exclusiveFilter でタグだけ消す
  if (tagName === 'div') return { tagName, attribs: {} };

  let out: Attributes = {};
  if (tagName === 'a') {
    out = transformLink(attribs);
  } else if (tagName === 'img') {
    const image = transformImage(attribs);
    // src のない img は exclusiveFilter で消す
    if (!image) return { tagName, attribs: {} };
    out = image;
  } else if (tagName === 'th' || tagName === 'td') {
    for (const name of ['colspan', 'rowspan']) {
      const value = attribs[name];
      if (value !== undefined && DIGITS.test(value)) out[name] = value;
    }
  } else if (tagName === 'figure') {
    transformEmbed(attribs, out);
  }

  // 目次のリンク先に使う id。DOM clobbering を防ぐため nbk- を付ける
  if (attribs.id !== undefined && SAFE_VALUE.test(attribs.id)) out.id = `nbk-${attribs.id}`;
  return { tagName, attribs: out };
}

/**
 * note の本文 HTML をサニタイズする（内部用。getArticle が使う）。
 * 外す・緩めるオプションは作らない。
 */
export function sanitizeNoteBody(html: string): string {
  // 目次（table-of-contents）の中身は捨てる。開いている深さを数え（目次そのものが 1）、中のテキストと要素を消す。
  // onCloseTag は exclusiveFilter より先に呼ばれるので、閉じるときに 1 以上なら目次の中の要素
  let tocDepth = 0;

  // 注意：transformTags で「許可しないタグ名」に置き換えてはいけない。sanitize-html は置き換えた名前を
  // 深さごとに記録し、許可しないタグを閉じるときにその記録を消さないため、同じ深さで次に閉じる許可タグの
  // 閉じタグ名がその名前になり、出力の構造が壊れる（例：</a> が </nbk-drop> になり、リンクが閉じない）。
  // 要素を消すときは、許可するタグ名のまま返して exclusiveFilter で消す。

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: DISCARD_WITH_CONTENT,
    selfClosing: ['img', 'br', 'hr'],
    enforceHtmlBoundary: false,
    // 属性値の実体参照を解いた値で URL を判定し、出力時にエスケープする前提（既定値だが明示する）
    parser: { decodeEntities: true },
    onOpenTag: (name) => {
      if (tocDepth > 0 || name === 'table-of-contents') tocDepth++;
    },
    onCloseTag: () => {
      if (tocDepth > 0) tocDepth--;
    },
    transformTags: { '*': transform },
    exclusiveFilter: (frame) => {
      // 目次の中の要素は中身ごと消す
      if (tocDepth > 0) return true;
      // 本文の div はタグだけ消す（目次の目印は frame.tag が table-of-contents なので残る）
      if (frame.tag === 'div') return 'excludeTag';
      // 許可しない読み込み元の画像（transform で src を付けなかったもの）
      if (frame.tag === 'img' && frame.attribs.src === undefined) return true;
      return false;
    },
    textFilter: (text) => (tocDepth > 0 ? '' : text),
  });
}
