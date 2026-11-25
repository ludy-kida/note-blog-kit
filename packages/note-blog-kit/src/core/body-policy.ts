/**
 * 本文 HTML の許可リスト（内部用。公開しない）。方針は docs/sanitize-policy.md。
 * /server のサニタイズ（sanitize-html）と /react の描画（保険の絞り込み）の両方がこの値を使う。
 * 依存を持たない定数だけを置く（/react の配布物に入るため）。
 * この許可リストの変更は人の承認が必要（CLAUDE.md・CODEOWNERS）。
 */

/** 許可するタグ（div は目次の目印 `<div data-nbk-toc>` にだけ使う。本文の div はタグを消す） */
export const ALLOWED_TAGS: readonly string[] = [
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

/**
 * 中身ごと捨てる要素。void 要素は入れない
 * （/react は閉じタグまで読み飛ばすため、閉じタグのない要素を入れると後ろの本文まで消える）
 */
export const DISCARD_WITH_CONTENT: readonly string[] = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'applet',
  'form',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'noscript',
  'title',
  'xmp',
  'plaintext',
  'noembed',
  'noframes',
];

/** 消す void 要素（中身はない。/server は nonTextTags に入れ、/react は許可しないタグとして消す） */
export const DISCARD_VOID: readonly string[] = ['embed', 'input', 'meta', 'link', 'base'];

/** 本文の画像を読み込んでよいホスト（note の CDN） */
export const IMAGE_HOST = 'assets.st-note.com';
/** 本文の画像の URL の先頭 */
export const IMAGE_PREFIX = `https://${IMAGE_HOST}/`;
/** id・埋め込みの種類など、属性値に使える文字 */
export const SAFE_VALUE = /^[A-Za-z0-9\-_.:/]+$/;
/** 見える文字を含むか（空白とゼロ幅の文字だけのテキストは、リンクの名前にならない） */
export const VISIBLE_TEXT = /[^\s\u200B-\u200D\u2060\uFEFF]/;
/** 幅・高さ・colspan・rowspan に使える値 */
export const DIGITS = /^\d+$/;
