import type { ReactElement, ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  NoteArticle,
  NoteArticlePage,
  NoteArticleSummary,
  NoteArticlesHandlerErrorCode,
  NoteEmbed,
  NoteTocItem,
} from '../index.js';
import {
  NoteArticleBody,
  type NoteArticleBodyProps,
  NoteArticleCard,
  type NoteArticleCardProps,
  NoteArticleList,
  type NoteArticleListProps,
  type NoteBodyComponents,
  type NoteBodyEmbedProps,
  type NoteBodyHeadingProps,
  type NoteBodyImageProps,
  type NoteBodyTocProps,
  type NoteHeadingLevel,
  type NoteLinkComponent,
  NotePagination,
  type NotePaginationProps,
  type UseNoteArticlesError,
  type UseNoteArticlesOptions,
  type UseNoteArticlesResult,
  useNoteArticles,
} from './index.js';

describe('note-blog-kit/react の公開型', () => {
  it('useNoteArticles は url だけが必須で、記事・ページ・状態を返す', () => {
    expectTypeOf(useNoteArticles).parameter(0).toEqualTypeOf<UseNoteArticlesOptions>();
    expectTypeOf(useNoteArticles).returns.toEqualTypeOf<UseNoteArticlesResult>();
    expectTypeOf<{ url: string }>().toExtend<UseNoteArticlesOptions>();
    expectTypeOf<UseNoteArticlesOptions['fetch']>().toEqualTypeOf<typeof globalThis.fetch | undefined>();
    expectTypeOf<UseNoteArticlesResult>().toEqualTypeOf<{
      articles: NoteArticleSummary[];
      data: NoteArticlePage | null;
      isLoading: boolean;
      error: UseNoteArticlesError | null;
    }>();
    // ページの番号と紛らわしいので、ページ情報は page ではなく data
    expectTypeOf<UseNoteArticlesResult>().not.toHaveProperty('page');
    expectTypeOf<UseNoteArticlesError>().toExtend<Error>();
    expectTypeOf<UseNoteArticlesError['status']>().toEqualTypeOf<number | null>();
    expectTypeOf<UseNoteArticlesError['code']>().toEqualTypeOf<NoteArticlesHandlerErrorCode | null>();
  });

  it('NoteArticleBody は article だけが必須で、components の props が決まっている', () => {
    expectTypeOf(NoteArticleBody).parameter(0).toEqualTypeOf<NoteArticleBodyProps>();
    expectTypeOf(NoteArticleBody).returns.toEqualTypeOf<ReactElement>();
    expectTypeOf<{ article: NoteArticle }>().toExtend<NoteArticleBodyProps>();
    expectTypeOf<{ article: NoteArticleSummary }>().not.toExtend<NoteArticleBodyProps>();
    expectTypeOf<NoteArticleBodyProps['labels']>().toEqualTypeOf<
      { readMore?: ReactNode; toc?: ReactNode } | undefined
    >();
    expectTypeOf<NoteBodyImageProps>().toEqualTypeOf<{ src: string; alt: string; width?: number; height?: number }>();
    expectTypeOf<NoteBodyHeadingProps>().toEqualTypeOf<{ level: 2 | 3 | 4; id?: string; children?: ReactNode }>();
    expectTypeOf<NoteBodyEmbedProps['service']>().toEqualTypeOf<NoteEmbed['service']>();
    expectTypeOf<NoteArticleBodyProps['linkComponent']>().toEqualTypeOf<NoteLinkComponent | undefined>();
    expectTypeOf<(props: NoteBodyImageProps) => ReactElement>().toExtend<NoteBodyComponents['img']>();
    expectTypeOf<'img'>().not.toExtend<NoteBodyComponents['img']>();
    expectTypeOf<NoteBodyEmbedProps['embed']>().toEqualTypeOf<NoteEmbed | null>();
    expectTypeOf<NoteBodyTocProps>().toEqualTypeOf<{ items: NoteTocItem[]; linkableIds: string[]; title: ReactNode }>();
    expectTypeOf<keyof NoteBodyComponents>().toEqualTypeOf<'img' | 'heading' | 'embed' | 'toc'>();
  });

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
