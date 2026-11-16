/**
 * サニタイズ済みの本文 HTML を、描画用の小さな木に変える（内部用）。
 *
 * 本文は /server（sanitizeNoteBody）でサニタイズ済みだが、正規化を通らないデータを渡された場合の保険として、
 * ここでも #8 と同じ許可リストで絞る。許可しないタグは中身だけ残し、許可しない属性は捨てる。
 * 出力は React 要素にするだけで、HTML として挿入しない（テキストは React がエスケープする）。
 */

export interface BodyElement {
  tag: string;
  attrs: Record<string, string>;
  children: BodyNode[];
}
export type BodyNode = string | BodyElement;

const ALLOWED_TAGS = new Set([
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
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
/** 空白だけのテキストを子に持てない要素（React が警告する） */
const NO_TEXT_TAGS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tr']);

const TOKEN_RE =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*\/?>|[^<]+|</g;
const ATTR_RE = /([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name[0] !== '#') return NAMED_ENTITIES[name] ?? whole;
    const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return valid ? String.fromCodePoint(code) : '�';
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(ATTR_RE)) {
    const name = (m[1] as string).toLowerCase();
    // 同じ属性が重なったら先勝ち（ブラウザと同じ）
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** HTML を木にする。許可しないタグは子だけを親に移す */
export function parseBody(html: string): BodyNode[] {
  const root: BodyElement = { tag: '#root', attrs: {}, children: [] };
  const stack: BodyElement[] = [root];
  const append = (node: BodyNode) => {
    const parent = stack[stack.length - 1] as BodyElement;
    if (typeof node === 'string' && NO_TEXT_TAGS.has(parent.tag) && node.trim() === '') return;
    parent.children.push(node);
  };

  for (const m of html.matchAll(TOKEN_RE)) {
    const [token, closing, rawName, rawAttrs] = m;
    if (rawName === undefined) {
      // コメントは捨てる。タグにならない「<」はテキスト
      if (!token.startsWith('<!--')) append(decodeEntities(token));
      continue;
    }
    const tag = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      // 対応する開きタグまで閉じる。なければ無視する
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if ((stack[i] as BodyElement).tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const el: BodyElement = { tag, attrs: parseAttrs(rawAttrs ?? ''), children: [] };
    append(el);
    if (!VOID_TAGS.has(tag)) stack.push(el);
  }
  return root.children;
}
