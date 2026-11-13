import type { ReactElement, ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { NoteArticleSummary } from '../index.js';
import {
  NoteArticleCard,
  type NoteArticleCardProps,
  NoteArticleList,
  type NoteArticleListProps,
  type NoteHeadingLevel,
  type NoteLinkComponent,
  NotePagination,
  type NotePaginationProps,
} from './index.js';

describe('note-blog-kit/react の公開型', () => {
  it('各コンポーネントは対応する props を受け取り、ReactElement を返す', () => {
    expectTypeOf(NoteArticleCard).parameter(0).toEqualTypeOf<NoteArticleCardProps>();
    expectTypeOf(NoteArticleList).parameter(0).toEqualTypeOf<NoteArticleListProps>();
    expectTypeOf(NotePagination).parameter(0).toEqualTypeOf<NotePaginationProps>();
    expectTypeOf(NoteArticleCard).returns.toEqualTypeOf<ReactElement>();
  });

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

  it('linkComponent には "a" や、href（文字列）・className を受け取るコンポーネントを渡せる', () => {
    expectTypeOf<'a'>().toExtend<NoteLinkComponent>();
    expectTypeOf<
      (props: { href: string; className?: string; children?: ReactNode }) => null
    >().toExtend<NoteLinkComponent>();
    // Next.js の Link のように href が string | UrlObject のものも渡せる
    expectTypeOf<
      (props: { href: string | { pathname: string }; className?: string; children?: ReactNode }) => null
    >().toExtend<NoteLinkComponent>();
    // 余分な必須 props を要求するコンポーネントは渡せない
    expectTypeOf<(props: { href: string; to: string }) => null>().not.toExtend<NoteLinkComponent>();
  });

  it('見出しレベルは 2〜6', () => {
    expectTypeOf<NoteHeadingLevel>().toEqualTypeOf<2 | 3 | 4 | 5 | 6>();
    expectTypeOf<NoteArticleCardProps['headingLevel']>().toEqualTypeOf<NoteHeadingLevel | undefined>();
  });

  it('記事の配列は readonly でも渡せる', () => {
    expectTypeOf<{ articles: readonly NoteArticleSummary[] }>().toExtend<NoteArticleListProps>();
  });
});
