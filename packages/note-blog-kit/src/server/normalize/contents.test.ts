import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { NoteArticlePage } from '../../core/types.js';
import { NoteError, NoteSchemaError } from '../errors.js';
import { normalizeContentsPage } from './contents.js';

const loadPage = (page: number): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../../fixtures/contents/page-${page}.json`, import.meta.url), 'utf8'));

const PROFILE_IMAGE =
  'https://assets.st-note.com/production/uploads/images/327785402/profile_28ea97d44a29ae189ecad5cf4c254448.jpg?fit=bounds&format=jpeg&quality=85&width=330';

/** fixture を複製して一部を書き換える */
function mutate(
  page: number,
  edit: (json: { data: { contents: Record<string, unknown>[] } & Record<string, unknown> }) => void,
) {
  const json = structuredClone(loadPage(page)) as {
    data: { contents: Record<string, unknown>[] } & Record<string, unknown>;
  };
  edit(json);
  return json;
}

function findArticle(result: NoteArticlePage, key: string) {
  const article = result.articles.find((item) => item.key === key);
  if (article === undefined) throw new Error(`fixture に ${key} がありません`);
  return article;
}

describe('normalizeContentsPage', () => {
  it('3ページの fixture の18件すべてを変換できる', () => {
    const articles = [1, 2, 3].flatMap((page) => normalizeContentsPage(loadPage(page), page).articles);
    expect(articles).toHaveLength(18);
    expect(new Set(articles.map((article) => article.key)).size).toBe(18);
    for (const article of articles) {
      expect(article.source).toBe('api');
    }
  });

  it('無料記事を公開型に変換する', () => {
    const article = findArticle(normalizeContentsPage(loadPage(1), 1), 'n55256baa5425');
    expect(article).toEqual({
      key: 'n55256baa5425',
      title: 'ノンアルコールワインをクリスマスに。乾杯用スパークリング3選',
      url: 'https://note.com/kida_lw/n/n55256baa5425',
      publishedAt: '2026-11-12T00:38:42.000Z',
      excerpt: expect.stringMatching(/^この記事はAmazonアソシエイトのリンクを含みます（PR）。/),
      eyecatchUrl:
        'https://assets.st-note.com/production/uploads/images/335100586/rectangle_large_type_2_7c58efbf45938c6a7c6c44d30a45bccb.png?fit=bounds&quality=85&width=1280',
      hashtags: ['クリスマス', '手土産', 'ソバーキュリアス', 'スパークリングワイン', 'ノンアルコールワイン'],
      likeCount: 0,
      price: 0,
      author: { name: '木田貴之', urlname: 'kida_lw', imageUrl: PROFILE_IMAGE },
      source: 'api',
    });
    expect(article.excerpt).toBe(article.excerpt.trim());
  });

  it('有料記事は price が正で、抜粋は空文字', () => {
    const article = findArticle(normalizeContentsPage(loadPage(1), 1), 'n52a7f4fa0a2e');
    expect(article.price).toBe(980);
    expect(article.likeCount).toBe(19);
    expect(article.excerpt).toBe('');
    expect(article.publishedAt).toBe('2025-12-19T10:07:21.000Z');
    expect(article.hashtags).toEqual(['note', 'マーケティング', 'エンジニア', 'GAS', 'note運用', 'LookerStudio']);
  });

  it('publishedAt は ISO 8601（UTC）', () => {
    for (const article of normalizeContentsPage(loadPage(2), 2).articles) {
      expect(article.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(new Date(article.publishedAt).toISOString()).toBe(article.publishedAt);
    }
  });

  it('ページ情報を反映する', () => {
    const result = normalizeContentsPage(loadPage(3), 3);
    expect(result.page).toBe(3);
    expect(result.isLastPage).toBe(false);
    expect(result.totalCount).toBe(237);
    expect(result.articles).toHaveLength(6);
  });

  it('isLastPage が true なら反映する', () => {
    const json = mutate(1, (draft) => {
      draft.data.isLastPage = true;
    });
    expect(normalizeContentsPage(json, 1).isLastPage).toBe(true);
  });

  it('見出し画像・プロフィール画像が空なら null', () => {
    const json = mutate(1, (draft) => {
      const first = draft.data.contents[0] as Record<string, unknown> & { user: Record<string, unknown> };
      first.eyecatch = '';
      first.user.userProfileImagePath = '';
    });
    const [first] = normalizeContentsPage(json, 1).articles;
    expect(first?.eyecatchUrl).toBeNull();
    expect(first?.author.imageUrl).toBeNull();
  });

  it('2026-11-23 取得の fixture（見出し画像のない記事を含む）を変換できる', () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL('../../../../../fixtures/2026-11-17/contents/page-1.json', import.meta.url), 'utf8'),
    );
    const result = normalizeContentsPage(json, 1);
    expect(result.articles).toHaveLength(6);
    expect(result.articles.find((a) => a.key === 'n739726ca45e7')?.eyecatchUrl).toBeNull();
    expect(result.articles.filter((a) => a.eyecatchUrl !== null)).toHaveLength(5);
  });

  it('見出し画像のない記事（eyecatch: null。実データで確認）は eyecatchUrl: null', () => {
    const json = mutate(1, (draft) => {
      (draft.data.contents[1] as Record<string, unknown>).eyecatch = null;
    });
    expect(normalizeContentsPage(json, 1).articles[1]?.eyecatchUrl).toBeNull();
  });

  it('記事キーの形式が違えば NoteSchemaError（リンクやキャッシュキーに使われるため）', () => {
    for (const key of ['../admin', 'a/b?x=1', '', 'N55256BAA5425', 'n55256baa5425#x']) {
      const json = mutate(1, (draft) => {
        (draft.data.contents[2] as Record<string, unknown>).key = key;
      });
      const error = (() => {
        try {
          normalizeContentsPage(json, 1);
        } catch (e) {
          return e;
        }
      })();
      expect(error, key).toBeInstanceOf(NoteSchemaError);
      expect((error as NoteSchemaError).issues.map((issue) => issue.path)).toContain('data.contents.2.key');
    }
  });

  it('著者のユーザー名の形式が違えば NoteSchemaError（著者の確認やリンクに使われるため）', () => {
    for (const urlname of ['a/../b', '', 'a b']) {
      const json = mutate(1, (draft) => {
        (draft.data.contents[0] as { user: Record<string, unknown> }).user.urlname = urlname;
      });
      const error = (() => {
        try {
          normalizeContentsPage(json, 1);
        } catch (e) {
          return e;
        }
      })();
      expect(error, urlname).toBeInstanceOf(NoteSchemaError);
      expect((error as NoteSchemaError).issues.map((issue) => issue.path)).toContain('data.contents.0.user.urlname');
    }
  });

  it('想定していない null は受け付けず NoteSchemaError（契約テストで形の変化を検知するため）', () => {
    const json = mutate(1, (draft) => {
      (draft.data.contents[1] as Record<string, unknown>).likeCount = null;
    });
    expect(() => normalizeContentsPage(json, 1)).toThrow(NoteSchemaError);
  });

  it('記事 URL・画像 URL が https でなければ NoteSchemaError（javascript: などを描画側に渡さない）', () => {
    const unsafe = [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'http://note.com/x',
      '//evil.example/x',
      'not a url',
    ];
    for (const field of ['noteUrl', 'eyecatch', 'userProfileImagePath'] as const) {
      for (const value of unsafe) {
        const json = mutate(1, (draft) => {
          const first = draft.data.contents[0] as Record<string, unknown> & { user: Record<string, unknown> };
          if (field === 'userProfileImagePath') first.user[field] = value;
          else first[field] = value;
        });
        expect(() => normalizeContentsPage(json, 1), `${field}: ${JSON.stringify(value)}`).toThrow(NoteSchemaError);
      }
    }
  });

  it('未知のキーが増えても失敗しない', () => {
    const json = mutate(1, (draft) => {
      draft.data.newTopLevelKey = 1;
      (draft.data.contents[0] as Record<string, unknown>).someNewField = { nested: true };
    });
    expect(normalizeContentsPage(json, 1).articles).toHaveLength(6);
  });

  it('使うキーが欠けたら NoteSchemaError（パスを含む）', () => {
    const json = mutate(1, (draft) => {
      delete (draft.data.contents[2] as Record<string, unknown>).key;
    });
    const error = captureError(() => normalizeContentsPage(json, 1));
    expect(error).toBeInstanceOf(NoteSchemaError);
    expect(error).toBeInstanceOf(NoteError);
    expect((error as NoteSchemaError).issues[0]?.path).toBe('data.contents.2.key');
  });

  it('型が違えば NoteSchemaError', () => {
    const json = mutate(1, (draft) => {
      (draft.data.contents[0] as Record<string, unknown>).price = '980';
    });
    const error = captureError(() => normalizeContentsPage(json, 1)) as NoteSchemaError;
    expect(error).toBeInstanceOf(NoteSchemaError);
    expect(error.issues.map((issue) => issue.path)).toContain('data.contents.0.price');
  });

  it('data がない・形が違うときも NoteSchemaError', () => {
    for (const input of [undefined, null, 'x', {}, { data: null }, { data: { contents: {} } }]) {
      expect(() => normalizeContentsPage(input, 1)).toThrow(NoteSchemaError);
    }
  });

  it('戻り値は NoteArticlePage', () => {
    expectTypeOf(normalizeContentsPage).returns.toEqualTypeOf<NoteArticlePage>();
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('例外が発生しませんでした');
}
