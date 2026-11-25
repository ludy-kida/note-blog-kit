import type { NoteArticle } from '../core/types.js';
import { NoteNotFoundError, NoteSchemaError } from './errors.js';
import { fetchNoteJson, NOTE_ORIGIN } from './fetch-json.js';
import { normalizeNote } from './normalize/note.js';
import { NOTE_KEY_RE, NOTE_USER_RE } from './patterns.js';
import {
  assertMilliseconds,
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  type NoteRequestOptions,
} from './request-options.js';
import { getDefaultThrottle } from './throttle.js';

/** {@link getArticle} のオプション */
export interface GetArticleOptions extends NoteRequestOptions {
  /** 記事キー（例: n55256baa5425。記事 URL の /n/ の後ろ）。n と英小文字・数字のみ */
  key: string;
  /**
   * 表示してよい著者のユーザー名（note.com/{user} の部分）。1人なら文字列、複数なら配列で指定する
   * （例: `'your_urlname'`、`['alice', 'bob']`）。大文字小文字も含めて一致した著者の記事だけを返す
   */
  user: string | readonly string[];
}

/** user を検証して配列にそろえる。空・不正な名前は TypeError */
function toAllowedUsers(user: unknown): ReadonlySet<string> {
  const users: unknown[] = typeof user === 'string' ? [user] : Array.isArray(user) ? user : [];
  if (users.length === 0 || !users.every((name) => typeof name === 'string' && NOTE_USER_RE.test(name))) {
    throw new TypeError(
      `user must be a note user name or a non-empty array of them: ${JSON.stringify(user) ?? typeof user}`,
    );
  }
  return new Set(users as string[]);
}

/**
 * 記事1件を取得する（サーバー専用。note は CORS に対応していない）。
 * 本文（`bodyHtml`）はサニタイズ済み。有料記事は無料部分だけで、`isPartial` が true になる。
 * 有料記事の `toc` は有料部分の見出しも含むため、一部の `id` は `bodyHtml` の中にない。
 *
 * note の API は記事キーだけで誰の記事でも返すため、`user` に指定した著者の記事だけを返す
 * （ほかの著者の記事は `NoteNotFoundError`）。ページの URL から受け取ったキーをそのまま渡しても、他人の記事は表示されない。
 *
 * @example
 * ```ts
 * const article = await getArticle({ key: 'n55256baa5425', user: 'your_urlname' });
 * // 複数の著者で運用するサイト
 * const article2 = await getArticle({ key, user: ['alice', 'bob'] });
 * ```
 * @throws {TypeError} key・user やオプションが不正なとき
 * @throws {NoteNotFoundError} 記事が見つからないとき、または `user` にない著者の記事のとき
 * @throws {NoteHttpError} その他の 2xx でないステータス
 * @throws {NoteNetworkError} 通信に失敗したとき
 * @throws {NoteTimeoutError} タイムアウトしたとき
 * @throws {NoteSchemaError} レスポンスの形が想定と違うとき
 */
export async function getArticle(options: GetArticleOptions): Promise<NoteArticle> {
  const { key, timeoutMs = DEFAULT_TIMEOUT_MS, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, signal } = options;
  // 文字列への変換で値が変わるオブジェクトを受け付けないよう、型も確認する
  if (typeof key !== 'string' || !NOTE_KEY_RE.test(key)) {
    throw new TypeError(`Invalid note article key: ${typeof key === 'string' ? JSON.stringify(key) : typeof key}`);
  }
  const allowedUsers = toAllowedUsers(options.user);
  assertMilliseconds('timeoutMs', timeoutMs, 1);
  assertMilliseconds('minIntervalMs', minIntervalMs, 0);

  const url = `${NOTE_ORIGIN}/api/v3/notes/${key}`;
  await getDefaultThrottle()(minIntervalMs, signal);
  const json = await fetchNoteJson(url, { fetch: options.fetch ?? globalThis.fetch, timeoutMs, signal });
  const article = normalizeNote(json);
  // 利用者がリンクやキャッシュキーに使うため、要求したキーの記事が返ってきたことを確かめる
  if (article.key !== key) {
    throw new NoteSchemaError('note returned a different article than requested', {
      issues: [{ path: 'data.key', message: `Expected ${key}` }],
    });
  }
  // 他人の記事を表示しないよう、指定した著者の記事だけを返す
  if (!allowedUsers.has(article.author.urlname)) {
    throw new NoteNotFoundError(`Article ${key} is not by an allowed user (${article.author.urlname})`, { url });
  }
  return article;
}
