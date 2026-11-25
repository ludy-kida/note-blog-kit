/** note の識別子の形式（内部用）。引数の検証とレスポンスの正規化で同じ規則を使う */

/** 記事キー（例: n55256baa5425）。n と英小文字・数字のみ */
export const NOTE_KEY_RE = /^n[0-9a-z]{1,32}$/;

/**
 * 値が note の記事キー（`n` と英小文字・数字、2〜33文字）の形か判定する。
 * ページの URL から受け取ったキーは、これが false なら 404 として扱う
 * （`getArticle` に渡すと TypeError になり、設定の誤りと区別できなくなるため）。
 *
 * @example
 * ```ts
 * if (!isNoteArticleKey(key)) notFound();
 * ```
 */
export function isNoteArticleKey(value: string): boolean;
/** {@inheritDoc isNoteArticleKey:(1)}。文字列でない値は false（true なら string に絞られる） */
export function isNoteArticleKey(value: unknown): value is string;
export function isNoteArticleKey(value: unknown): boolean {
  return typeof value === 'string' && NOTE_KEY_RE.test(value);
}

/** ユーザー名（note.com/{user} の部分）。英数字・_・- のみ */
export const NOTE_USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
