/**
 * サニタイズ済みの本文 HTML を、描画用の小さな木に変える（内部用）。
 *
 * 本文は /server（sanitizeNoteBody）でサニタイズ済みだが、正規化を通らないデータを渡された場合の保険として、
 * ここでも #8 と同じ許可リストで絞る。許可しないタグは中身だけ残し（危険な要素は中身ごと捨て）、属性は描画側で絞る。
 * 出力は React 要素にするだけで、HTML として挿入しない（テキストは React がエスケープする）。
 * どんな入力でも入力長にほぼ比例する時間で終わり、React が警告する入れ子を作らないようにする。
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
/** 中身ごと捨てる要素（docs/sanitize-policy.md の 2.） */
const DISCARD_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
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
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
/** テキストを子に持てない要素（React が警告する） */
const NO_TEXT_TAGS = new Set(['table', 'thead', 'tbody', 'tr']);
/** 開くと、開いている p を閉じる要素（HTML の暗黙の閉じタグ） */
const CLOSES_P = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'figure', 'pre', 'hr', 'table', 'div']);
/** これより深いタグは中身だけを親に移す（再帰で描画するため、スタックを使い切らないように） */
const MAX_DEPTH = 128;

// 属性名・引用符なしの値に「<」を含めない（閉じていないタグで、後ろを何度も読み直さないため）
const TOKEN_RE =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/"'<]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"'<]+))?)*)\s*\/?>|[^<]+|</g;
const ATTR_RE = /([^\s=>/"'<]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'<]+)))?/g;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,8}|#[0-9]{1,10}|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name[0] !== '#') return Object.hasOwn(NAMED_ENTITIES, name) ? (NAMED_ENTITIES[name] as string) : whole;
    const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    return valid ? String.fromCodePoint(code) : '�';
  });
}

function parseAttrs(source: string): Record<string, string> {
  // プロトタイプを持たないオブジェクト（constructor・__proto__ などの属性名でも正しく扱う）
  const attrs: Record<string, string> = Object.create(null);
  for (const m of source.matchAll(ATTR_RE)) {
    const name = (m[1] as string).toLowerCase();
    // 同じ属性が重なったら先勝ち（ブラウザと同じ）
    if (!Object.hasOwn(attrs, name)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** HTML を木にする。許可しないタグは子だけを親に移す */
export function parseBody(html: string): BodyNode[] {
  const root: BodyElement = { tag: '#root', attrs: Object.create(null), children: [] };
  const stack: BodyElement[] = [root];
  const top = () => stack[stack.length - 1] as BodyElement;
  /** 対応する開きタグまで閉じる（なければ何もしない） */
  const closeTo = (tag: string) => {
    for (let i = stack.length - 1; i > 0; i -= 1) {
      if ((stack[i] as BodyElement).tag === tag) {
        stack.length = i;
        return;
      }
    }
  };
  const append = (node: BodyNode) => {
    if (typeof node === 'string' && (NO_TEXT_TAGS.has(top().tag) || (top().tag !== 'pre' && node === ''))) return;
    top().children.push(node);
  };

  // 中身ごと捨てる要素の閉じタグ探しに使う（毎回小文字にすると、要素の数に比例して遅くなる）
  const lower = html.toLowerCase();
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m !== null; m = TOKEN_RE.exec(html)) {
    const [token, closing, rawName, rawAttrs] = m;
    if (rawName === undefined) {
      // コメントは捨てる。タグにならない「<」はテキスト
      if (!token.startsWith('<!--')) append(decodeEntities(token));
      continue;
    }
    const tag = rawName.toLowerCase();
    if (DISCARD_TAGS.has(tag)) {
      // 閉じタグまで中身ごと読み飛ばす（閉じタグがなければ最後まで）
      if (!closing) {
        const end = lower.indexOf(`</${tag}`, TOKEN_RE.lastIndex);
        TOKEN_RE.lastIndex = end === -1 ? html.length : end;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      closeTo(tag);
      continue;
    }
    if (CLOSES_P.has(tag)) closeTo('p');
    // a の中の a は外側を閉じる
    if (tag === 'a' && stack.some((el) => el.tag === 'a')) closeTo('a');
    if (stack.length > MAX_DEPTH) continue;
    // table 直下の tr は tbody で包む
    if (tag === 'tr' && top().tag === 'table') {
      const tbody: BodyElement = { tag: 'tbody', attrs: Object.create(null), children: [] };
      append(tbody);
      stack.push(tbody);
    }
    const el: BodyElement = { tag, attrs: parseAttrs(rawAttrs ?? ''), children: [] };
    append(el);
    if (!VOID_TAGS.has(tag)) stack.push(el);
  }
  return root.children;
}
