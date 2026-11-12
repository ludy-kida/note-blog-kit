import { describe, expectTypeOf, it } from 'vitest';
import type { NoteArticlePage } from '../index.js';
import {
  isNoteError,
  type ListArticlesOptions,
  listArticles,
  type NoteError,
  type NoteErrorCode,
  type NoteHttpError,
  type NoteSchemaError,
  type NoteSchemaIssue,
} from './index.js';

describe('note-blog-kit/server の公開型', () => {
  it('listArticles は NoteArticlePage を返す', () => {
    expectTypeOf(listArticles).parameter(0).toEqualTypeOf<ListArticlesOptions>();
    expectTypeOf(listArticles).returns.toEqualTypeOf<Promise<NoteArticlePage>>();
  });

  it('user だけが必須', () => {
    expectTypeOf<{ user: string }>().toExtend<ListArticlesOptions>();
    expectTypeOf<{ page: number }>().not.toExtend<ListArticlesOptions>();
  });

  it('エラーの code はリテラルのユニオン', () => {
    expectTypeOf<NoteError['code']>().toEqualTypeOf<NoteErrorCode>();
    expectTypeOf<NoteErrorCode>().toEqualTypeOf<
      'NOTE_NOT_FOUND' | 'NOTE_HTTP_ERROR' | 'NOTE_NETWORK_ERROR' | 'NOTE_TIMEOUT' | 'NOTE_SCHEMA_ERROR'
    >();
  });

  it('NoteHttpError は status を、NoteSchemaError は readonly な issues を持つ', () => {
    expectTypeOf<NoteHttpError['status']>().toEqualTypeOf<number>();
    expectTypeOf<NoteSchemaError['issues']>().toEqualTypeOf<readonly NoteSchemaIssue[]>();
  });

  it('isNoteError は型ガード', () => {
    expectTypeOf(isNoteError).guards.toEqualTypeOf<NoteError>();
  });
});
