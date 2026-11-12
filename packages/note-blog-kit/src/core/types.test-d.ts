import { describe, expectTypeOf, it } from 'vitest';
import type { NoteArticle, NoteArticlePage, NoteArticleSummary } from '../index.js';

describe('公開型', () => {
  it('RSS で取れない項目は null を許す', () => {
    expectTypeOf<NoteArticleSummary['likeCount']>().toEqualTypeOf<number | null>();
    expectTypeOf<NoteArticleSummary['price']>().toEqualTypeOf<number | null>();
    expectTypeOf<NoteArticlePage['totalCount']>().toEqualTypeOf<number | null>();
  });

  it('取得元は api か rss', () => {
    expectTypeOf<NoteArticleSummary['source']>().toEqualTypeOf<'api' | 'rss'>();
  });

  it('詳細は一覧の型を拡張する', () => {
    expectTypeOf<NoteArticle>().toExtend<NoteArticleSummary>();
    expectTypeOf<NoteArticle['isPartial']>().toEqualTypeOf<boolean>();
  });
});
