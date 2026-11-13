/**
 * 既定値として描画する URL（記事 URL・画像 URL）が http(s) かを確かめる。
 * 正規化（/server）でも https に限っているが、正規化を通らないデータ（手で組んだ値や古いキャッシュ）を渡された場合の保険。
 * React 18 は `javascript:` の href をブロックしないため、ライブラリの既定値はここで守る。
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  for (let i = 0; i < url.length; i += 1) {
    const code = url.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  return url;
}
