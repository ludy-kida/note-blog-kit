import { describe, expectTypeOf, it } from 'vitest';
import {
  type GenerateNoteMetadataOptions,
  type GenerateNoteStaticParamsOptions,
  generateNoteMetadata,
  generateNoteStaticParams,
  type NoteArticle,
  type NoteArticleSummary,
  type NoteMetadata,
} from './index.js';

describe('note-blog-kit/next の公開型', () => {
  it('generateNoteMetadata は記事（詳細・一覧）を受け取り NoteMetadata を返す', () => {
    expectTypeOf(generateNoteMetadata).returns.toEqualTypeOf<NoteMetadata>();
    expectTypeOf<NoteArticle>().toExtend<Parameters<typeof generateNoteMetadata>[0]>();
    expectTypeOf<NoteArticleSummary>().toExtend<Parameters<typeof generateNoteMetadata>[0]>();
    expectTypeOf<GenerateNoteMetadataOptions>().toEqualTypeOf<{
      canonical?: string;
      formatTitle?: (title: string) => string;
    }>();
  });

  it('generateNoteStaticParams は param の名前をキーにした配列を返す', () => {
    expectTypeOf(generateNoteStaticParams<'key'>).returns.toEqualTypeOf<Promise<{ key: string }[]>>();
    expectTypeOf(generateNoteStaticParams<'slug'>).returns.toEqualTypeOf<Promise<{ slug: string }[]>>();
    expectTypeOf<{ user: string }>().toExtend<GenerateNoteStaticParamsOptions>();
    expectTypeOf<GenerateNoteStaticParamsOptions['maxPages']>().toEqualTypeOf<number | undefined>();
  });
});
