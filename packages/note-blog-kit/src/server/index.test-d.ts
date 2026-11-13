import { describe, expectTypeOf, it } from 'vitest';
import type { NoteArticlePage, NoteArticleSummary } from '../index.js';
import {
  type AnyNoteError,
  type IterateArticlesOptions,
  type IterateArticlesResult,
  isNoteError,
  iterateArticles,
  type ListAllArticlesResult,
  type ListArticlesOptions,
  listAllArticles,
  listArticles,
  type NoteError,
  type NoteErrorCode,
  type NoteHttpError,
  type NoteNotFoundError,
  type NoteSchemaError,
  type NoteSchemaIssue,
} from './index.js';

describe('note-blog-kit/server の公開型', () => {
  it('listArticles は NoteArticlePage を返す', () => {
    expectTypeOf(listArticles).parameter(0).toEqualTypeOf<ListArticlesOptions>();
    expectTypeOf(listArticles).returns.toEqualTypeOf<Promise<NoteArticlePage>>();
  });

  it('user だけが必須で、各オプションの型が決まっている', () => {
    expectTypeOf<{ user: string }>().toExtend<ListArticlesOptions>();
    expectTypeOf<{ page: number }>().not.toExtend<ListArticlesOptions>();
    expectTypeOf<ListArticlesOptions['page']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ListArticlesOptions['signal']>().toEqualTypeOf<AbortSignal | undefined>();
    expectTypeOf<ListArticlesOptions['timeoutMs']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ListArticlesOptions['minIntervalMs']>().toEqualTypeOf<number | undefined>();
  });

  it('iterateArticles・listAllArticles の型', () => {
    expectTypeOf(iterateArticles).returns.toEqualTypeOf<
      AsyncGenerator<NoteArticleSummary, IterateArticlesResult, undefined>
    >();
    expectTypeOf(listAllArticles).returns.toEqualTypeOf<Promise<ListAllArticlesResult>>();
    expectTypeOf<ListAllArticlesResult>().toExtend<IterateArticlesResult>();
    expectTypeOf<ListAllArticlesResult['articles']>().toEqualTypeOf<NoteArticleSummary[]>();
    expectTypeOf<IterateArticlesResult['truncated']>().toEqualTypeOf<boolean>();
    expectTypeOf<IterateArticlesResult['totalCount']>().toEqualTypeOf<number | null>();
    expectTypeOf<IterateArticlesResult['pages']>().toEqualTypeOf<number>();
  });

  it('IterateArticlesOptions は page を持たず、maxPages を持つ', () => {
    expectTypeOf<IterateArticlesOptions['maxPages']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<{ user: string }>().toExtend<IterateArticlesOptions>();
    // page は指定できない（全件取得は常に1ページ目から）
    // @ts-expect-error page は IterateArticlesOptions にない
    void listAllArticles({ user: 'x', page: 2 });
  });

  it('エラーの code はリテラルのユニオン', () => {
    expectTypeOf<NoteError['code']>().toEqualTypeOf<NoteErrorCode>();
    expectTypeOf<NoteErrorCode>().toEqualTypeOf<
      'NOTE_NOT_FOUND' | 'NOTE_HTTP_ERROR' | 'NOTE_NETWORK_ERROR' | 'NOTE_TIMEOUT' | 'NOTE_SCHEMA_ERROR'
    >();
    expectTypeOf<NoteHttpError['code']>().toEqualTypeOf<'NOTE_HTTP_ERROR'>();
  });

  it('NoteHttpError は status を、NoteSchemaError は readonly な issues を持つ', () => {
    expectTypeOf<NoteHttpError['status']>().toEqualTypeOf<number>();
    expectTypeOf<NoteSchemaError['issues']>().toEqualTypeOf<readonly NoteSchemaIssue[]>();
  });

  it('NoteNotFoundError は NoteHttpError を継承しない', () => {
    expectTypeOf<NoteNotFoundError>().not.toExtend<NoteHttpError>();
  });

  it('isNoteError で絞り込んだ後、code で各エラーの型に絞れる', () => {
    expectTypeOf(isNoteError).guards.toEqualTypeOf<AnyNoteError>();
    const error: unknown = null;
    if (isNoteError(error) && error.code === 'NOTE_HTTP_ERROR') {
      expectTypeOf(error).toEqualTypeOf<NoteHttpError>();
      expectTypeOf(error.status).toEqualTypeOf<number>();
    }
  });
});
