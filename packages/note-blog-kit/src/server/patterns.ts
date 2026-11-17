/** note の識別子の形式（内部用）。引数の検証とレスポンスの正規化で同じ規則を使う */

/** 記事キー（例: n55256baa5425）。n と英小文字・数字のみ */
export const NOTE_KEY_RE = /^n[0-9a-z]{1,32}$/;

/** ユーザー名（note.com/{user} の部分）。英数字・_・- のみ */
export const NOTE_USER_RE = /^[A-Za-z0-9_-]{1,64}$/;
