import { describe, expectTypeOf, it } from 'vitest';
import type {
  NoteArticle,
  NoteArticlePage,
  NoteArticleSummary,
  NoteArticlesHandlerErrorBody,
  NoteArticlesHandlerErrorCode,
  NoteErrorCode,
  NoteSyncedArticleList,
} from '../index.js';
import type { NoteErrorCode as ServerNoteErrorCode } from '../server/index.js';

describe('公開型', () => {
  it('RSS で取れない項目は null を許す', () => {
    expectTypeOf<NoteArticleSummary['likeCount']>().toEqualTypeOf<number | null>();
    expectTypeOf<NoteArticleSummary['price']>().toEqualTypeOf<number | null>();
    expectTypeOf<NoteArticlePage['totalCount']>().toEqualTypeOf<number | null>();
  });

  it('取得元は api か rss', () => {
    expectTypeOf<NoteArticleSummary['source']>().toEqualTypeOf<'api' | 'rss'>();
    // ページにも実際の取得元が入る（'auto' で RSS に切り替わったページは 'rss'）
    expectTypeOf<NoteArticlePage['source']>().toEqualTypeOf<'api' | 'rss'>();
  });

  it('詳細は一覧の型を拡張する', () => {
    expectTypeOf<NoteArticle>().toExtend<NoteArticleSummary>();
    expectTypeOf<NoteArticle['isPartial']>().toEqualTypeOf<boolean>();
  });

  it('CLI sync の articles.json の形（形式のバージョン 1）', () => {
    expectTypeOf<NoteSyncedArticleList>().toEqualTypeOf<{
      version: 1;
      user: string;
      syncedAt: string;
      truncated: boolean;
      articles: NoteArticleSummary[];
    }>();
  });

  it('中継エンドポイントのエラーコードは、独自の2つと NoteErrorCode', () => {
    expectTypeOf<NoteArticlesHandlerErrorCode>().toEqualTypeOf<'INVALID_REQUEST' | 'INTERNAL_ERROR' | NoteErrorCode>();
    expectTypeOf<NoteArticlesHandlerErrorBody>().toEqualTypeOf<{ error: NoteArticlesHandlerErrorCode }>();
  });

  it('core と /server の NoteErrorCode は同じ型', () => {
    expectTypeOf<NoteErrorCode>().toEqualTypeOf<ServerNoteErrorCode>();
  });
});
