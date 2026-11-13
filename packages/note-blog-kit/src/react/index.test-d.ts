import { describe, expectTypeOf, it } from 'vitest';
import type { NoteArticleSummary } from '../index.js';
import type { NoteArticleCardProps, NoteArticleListProps, NoteLinkComponent, NotePaginationProps } from './index.js';

describe('note-blog-kit/react の公開型', () => {
  it('必須の props', () => {
    expectTypeOf<{ article: NoteArticleSummary }>().toExtend<NoteArticleCardProps>();
    expectTypeOf<{ articles: NoteArticleSummary[] }>().toExtend<NoteArticleListProps>();
    expectTypeOf<{
      page: number;
      isLastPage: boolean;
      getHref: (page: number) => string;
    }>().toExtend<NotePaginationProps>();
    expectTypeOf<{ page: number; isLastPage: boolean }>().not.toExtend<NotePaginationProps>();
    expectTypeOf<object>().not.toExtend<NoteArticleCardProps>();
  });

  it('linkComponent には href と className を受け取るコンポーネントや "a" を渡せる', () => {
    expectTypeOf<'a'>().toExtend<NoteLinkComponent>();
    expectTypeOf<
      (props: { href: string; className?: string; children?: React.ReactNode }) => null
    >().toExtend<NoteLinkComponent>();
  });

  it('記事の配列は readonly でも渡せる', () => {
    expectTypeOf<{ articles: readonly NoteArticleSummary[] }>().toExtend<NoteArticleListProps>();
  });
});
