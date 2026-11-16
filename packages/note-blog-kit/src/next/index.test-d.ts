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
    expectTypeOf<GenerateNoteMetadataOptions['canonical']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<GenerateNoteMetadataOptions['formatTitle']>().toEqualTypeOf<((title: string) => string) | undefined>();
    expectTypeOf<{}>().toExtend<GenerateNoteMetadataOptions>();
  });

  it('generateNoteStaticParams は param の名前をキーにした配列を返す', () => {
    const user = 'kida_lw';
    // param を省くと { key }、渡すとその名前（推論される）
    expectTypeOf(generateNoteStaticParams({ user })).toEqualTypeOf<Promise<{ key: string }[]>>();
    expectTypeOf(generateNoteStaticParams({ user, param: 'slug' })).toEqualTypeOf<Promise<Record<'slug', string>[]>>();
    // 型引数だけを明示して param を省くことはできない（戻り値の型と実際の値が食い違うため）
    // @ts-expect-error param がない
    generateNoteStaticParams<'slug'>({ user });
    // @ts-expect-error param は文字列
    generateNoteStaticParams({ user, param: 1 });
    // @ts-expect-error user は必須
    generateNoteStaticParams({});
    expectTypeOf<{ user: string }>().toExtend<GenerateNoteStaticParamsOptions>();
    expectTypeOf<GenerateNoteStaticParamsOptions['maxPages']>().toEqualTypeOf<number | undefined>();
  });
});
