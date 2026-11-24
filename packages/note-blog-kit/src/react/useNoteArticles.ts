// フックは React 名前空間から呼ぶ（Server Component から /react を import したとき、
// react-server の React にない useState などを名前付き import で解決させないため）
import * as React from 'react';
import type { NoteArticlePage, NoteArticleSummary } from '../core/types.js';

/** {@link useNoteArticles} のオプション */
export interface UseNoteArticlesOptions {
  /**
   * 取得する URL。中継エンドポイント（`createNoteArticlesHandler` の Route Handler）か、
   * CLI `sync` が書き出した `articles.json`。同じオリジンの相対 URL か http(s) の URL。
   * note.com の URL は受け付けない（ブラウザから note へ直接アクセスしない）
   */
  url: string;
  /** fetch の差し替え（テスト用）。既定は globalThis.fetch */
  fetch?: typeof globalThis.fetch;
}

/** {@link useNoteArticles} の戻り値 */
export interface UseNoteArticlesResult {
  /** 取得した記事。取得前・失敗時は空 */
  articles: NoteArticleSummary[];
  /** ページ情報。`articles.json`（ページ情報がない）なら `{ page: 1, totalCount: null, isLastPage: true }` として扱う。取得前・失敗時は null */
  page: NoteArticlePage | null;
  /** 取得中か（最初の取得中と、url が変わって取り直している間は true） */
  isLoading: boolean;
  /** 取得に失敗したときのエラー（HTTP エラー・形の違う応答・取得できない URL）。成功・取得中は null */
  error: Error | null;
}

const INITIAL: UseNoteArticlesResult = { articles: [], page: null, isLoading: true, error: null };

/** 取得してよい URL か確かめる（http(s) のみ、note.com とそのサブドメインは不可） */
function checkUrl(url: string): Error | null {
  let parsed: URL;
  try {
    parsed = new URL(url, globalThis.location?.href ?? 'http://localhost/');
  } catch {
    return new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Error(`Only http(s) URLs can be fetched: ${parsed.protocol}`);
  }
  // 末尾のドット（note.com.）は同じホストを指すので取り除いてから比べる
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === 'note.com' || host.endsWith('.note.com')) {
    return new Error(
      'Do not fetch note.com from the browser. Use a relay endpoint or the JSON written by `note-blog-kit sync`',
    );
  }
  return null;
}

function toPage(json: unknown): NoteArticlePage {
  if (typeof json !== 'object' || json === null || !Array.isArray((json as { articles?: unknown }).articles)) {
    throw new Error('Unexpected response: `articles` is not an array');
  }
  const value = json as Partial<NoteArticlePage> & { articles: unknown[] };
  // 描画で落ちないよう、主な項目の型が違う記事は除く（URL は各コンポーネントが検証する）
  const articles = value.articles.filter(isArticleLike);
  if (typeof value.page === 'number' && typeof value.isLastPage === 'boolean') {
    return {
      articles,
      page: value.page,
      totalCount: typeof value.totalCount === 'number' ? value.totalCount : null,
      isLastPage: value.isLastPage,
    };
  }
  // CLI sync の articles.json（ページ情報がない）
  return { articles, page: 1, totalCount: null, isLastPage: true };
}

/** 描画に使う主な項目の型が合っているか（コンポーネントが例外で落ちないための最小限の確認） */
function isArticleLike(value: unknown): value is NoteArticleSummary {
  if (typeof value !== 'object' || value === null) return false;
  const article = value as Record<string, unknown>;
  const author = article.author as Record<string, unknown> | null | undefined;
  return (
    typeof article.key === 'string' &&
    typeof article.title === 'string' &&
    typeof article.url === 'string' &&
    typeof article.publishedAt === 'string' &&
    typeof article.excerpt === 'string' &&
    Array.isArray(article.hashtags) &&
    article.hashtags.every((tag) => typeof tag === 'string') &&
    (article.eyecatchUrl === null || typeof article.eyecatchUrl === 'string') &&
    (article.price === null || typeof article.price === 'number') &&
    typeof author === 'object' &&
    author !== null &&
    typeof author.name === 'string' &&
    typeof author.urlname === 'string'
  );
}

/**
 * 記事一覧を取得するクライアント用のフック（Vite などの SPA、Client Component 向け。`'use client'` のファイルで使う）。
 * 取得先は中継エンドポイントか CLI `sync` の JSON で、note には直接アクセスしない。
 * 受け取った記事は `NoteArticleList` などでそのまま描画できる（URL は各コンポーネントが検証する）。
 *
 * - 応答の検証は最小限（`articles` が配列で、各記事の主な項目の型が合うか。合わない記事は除く）。
 *   `url` には自分のサイトの中継エンドポイントか JSON を指定し、利用者の入力を使わないこと
 * - `credentials: 'same-origin'` で取得する（別オリジンに Cookie は送らない）
 * - `fetch` を渡す場合は、描画ごとに作り直さない（`url` が変わったときだけ取り直す）
 */
export function useNoteArticles(options: UseNoteArticlesOptions): UseNoteArticlesResult {
  const { url, fetch: customFetch } = options;
  const [state, setState] = React.useState<UseNoteArticlesResult>(INITIAL);
  // fetch は描画ごとに新しい関数を渡されても取り直さない（ref で最新を持つ）
  const fetchRef = React.useRef(customFetch);
  fetchRef.current = customFetch;

  React.useEffect(() => {
    const invalid = checkUrl(url);
    if (invalid) {
      setState({ articles: [], page: null, isLoading: false, error: invalid });
      return;
    }
    const controller = new AbortController();
    setState(INITIAL);
    (async () => {
      try {
        const response = await (fetchRef.current ?? globalThis.fetch)(url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
        const page = toPage((await response.json()) as unknown);
        if (!controller.signal.aborted) setState({ articles: page.articles, page, isLoading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          articles: [],
          page: null,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    })();
    return () => controller.abort();
  }, [url]);

  return state;
}
