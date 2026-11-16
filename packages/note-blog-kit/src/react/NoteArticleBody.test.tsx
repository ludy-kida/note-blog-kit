// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteArticle } from '../core/types.js';
import { PRESERVE_CASES, UNSAFE_CASES } from '../server/sanitize/cases.js';
import { sanitizeNoteBody } from '../server/sanitize/sanitize.js';
import {
  NoteArticleBody,
  type NoteBodyEmbedProps,
  type NoteBodyHeadingProps,
  type NoteBodyImageProps,
  type NoteBodyTocProps,
} from './NoteArticleBody.js';
import { FREE_KEY, loadNote, PAID_KEY } from './test-fixtures.js';

afterEach(cleanup);

const free = loadNote(FREE_KEY);
const paid = loadNote(PAID_KEY);

/** bodyHtml だけを差し替えた記事 */
function withBody(bodyHtml: string, extra: Partial<NoteArticle> = {}): NoteArticle {
  return { ...free, bodyHtml, toc: [], embeds: [], isPartial: false, ...extra };
}

function MyLink({ href, className, children }: { href: string; className?: string; children?: ReactNode }) {
  return (
    <a href={href} className={className} data-custom="1">
      {children}
    </a>
  );
}

describe('NoteArticleBody：既定の描画', () => {
  it('nbk-body の中に本文を描画し、iframe を出さない', () => {
    const { container } = render(<NoteArticleBody article={free} className="extra" />);
    const root = container.querySelector('div.nbk-body');
    expect(root?.className).toBe('nbk-body extra');
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(root?.textContent).toContain('この記事は約5分で読めます。');
  });

  it('本文の要素に nbk-body__* のクラスを付ける', () => {
    const { container } = render(<NoteArticleBody article={free} />);
    expect(container.querySelector('p')?.className).toBe('nbk-body__p');
    expect(container.querySelector('h3')?.className).toBe('nbk-body__h3');
    expect(container.querySelector('figure img')?.className).toBe('nbk-body__img');
    expect(container.querySelector('blockquote')?.className).toBe('nbk-body__blockquote');
  });

  it('見出しは id 付きで描画する', () => {
    const { container } = render(<NoteArticleBody article={free} />);
    for (const item of free.toc) {
      const heading = container.querySelector(`[id="${item.id}"]`);
      expect(heading?.tagName).toBe(`H${item.level}`);
      expect(heading?.textContent).toBe(item.text);
    }
  });

  it('画像は src・alt・幅・高さ・lazy loading 付きで描画する', () => {
    const { container } = render(<NoteArticleBody article={free} />);
    const img = container.querySelector('figure img');
    expect(img?.getAttribute('src')).toMatch(/^https:\/\/assets\.st-note\.com\//);
    expect(img?.getAttribute('width')).toBe('620');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });

  it('リンクは href・target・rel を保つ', () => {
    const { container } = render(<NoteArticleBody article={free} />);
    const link = container.querySelector('a[target="_blank"]');
    expect(link?.getAttribute('href')).toMatch(/^https:\/\/www\.amazon\.co\.jp\//);
    expect(link?.getAttribute('rel')).toBe('nofollow noopener noreferrer sponsored');
  });

  it('外部記事の埋め込みは中のリンクカードを、note の埋め込みは記事へのリンクを描画する', () => {
    const { container } = render(<NoteArticleBody article={free} />);
    const embeds = container.querySelectorAll('figure.nbk-embed');
    expect(embeds).toHaveLength(7);
    const external = container.querySelector('figure.nbk-embed[data-service="external-article"]');
    expect(external?.querySelector('a strong')).not.toBeNull();
    expect(external?.querySelector('a')?.className).toBe('nbk-embed__link');
    const note = container.querySelector('figure.nbk-embed[data-service="note"]');
    const noteLink = note?.querySelector('a.nbk-embed__link');
    expect(noteLink?.getAttribute('href')).toBe('https://note.com/kida_lw/n/n139dd4425bd8');
  });

  it('目次の位置に article.toc を描画する', () => {
    const { container } = render(<NoteArticleBody article={free} labels={{ toc: 'もくじ' }} />);
    const nav = container.querySelector('nav.nbk-toc');
    expect(nav?.querySelector('.nbk-toc__title')?.textContent).toBe('もくじ');
    const links = nav?.querySelectorAll('a.nbk-toc__link') ?? [];
    expect(links).toHaveLength(free.toc.length);
    expect(links[0]?.getAttribute('href')).toBe(`#${free.toc[0]?.id}`);
    expect(nav?.querySelector('.nbk-toc__item--h2')).not.toBeNull();
  });

  it('有料記事の目次で、本文にない見出しはリンクにしない', () => {
    const { container } = render(<NoteArticleBody article={paid} />);
    const items = container.querySelectorAll('nav.nbk-toc li');
    expect(items).toHaveLength(31);
    const linked = container.querySelectorAll('nav.nbk-toc a');
    for (const link of linked) {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
    expect(linked.length).toBeLessThan(31);
  });
});

describe('NoteArticleBody：続きは note で', () => {
  it('isPartial のとき記事 URL へのリンクを出す', () => {
    const { container } = render(<NoteArticleBody article={paid} />);
    const link = screen.getByRole('link', { name: '続きは note で' });
    expect(link.getAttribute('href')).toBe(paid.url);
    expect(link.closest('.nbk-body__more')).not.toBeNull();
    expect(container.querySelector('.nbk-body__more')?.parentElement?.className).toBe('nbk-body');
  });

  it('文言・リンク先・リンクの要素を差し替えられる', () => {
    render(
      <NoteArticleBody
        article={paid}
        labels={{ readMore: '有料部分を note で読む' }}
        readMoreHref="https://example.com/more"
        linkComponent={MyLink}
      />,
    );
    const link = screen.getByRole('link', { name: '有料部分を note で読む' });
    expect(link.getAttribute('href')).toBe('https://example.com/more');
    expect(link.getAttribute('data-custom')).toBe('1');
  });

  it('無料記事・URL が http(s) でない記事では出さない', () => {
    const { container: a } = render(<NoteArticleBody article={free} />);
    expect(a.querySelector('.nbk-body__more')).toBeNull();
    const { container: b } = render(<NoteArticleBody article={{ ...paid, url: 'javascript:alert(1)' }} />);
    expect(b.querySelector('.nbk-body__more')).toBeNull();
  });
});

describe('NoteArticleBody：components で置き換える', () => {
  it('img・heading・embed・toc を任意のコンポーネントに置き換えられる', () => {
    const images: NoteBodyImageProps[] = [];
    const headings: Omit<NoteBodyHeadingProps, 'children'>[] = [];
    const embeds: Omit<NoteBodyEmbedProps, 'children'>[] = [];
    const tocs: NoteBodyTocProps[] = [];
    const { container } = render(
      <NoteArticleBody
        article={free}
        components={{
          img: (props) => {
            images.push(props);
            return <span data-testid="img" />;
          },
          heading: ({ children, ...props }) => {
            headings.push(props);
            return <p data-testid="heading">{children}</p>;
          },
          embed: ({ children, ...props }) => {
            embeds.push(props);
            return <div data-testid={`embed-${props.service}`}>{props.service === 'note' ? null : children}</div>;
          },
          toc: (props) => {
            tocs.push(props);
            return <div data-testid="toc" />;
          },
        }}
      />,
    );
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ alt: '', width: 620 });
    expect(images[0]?.src).toMatch(/^https:\/\/assets\.st-note\.com\//);

    expect(headings).toHaveLength(free.toc.length);
    expect(headings[0]).toEqual({ level: 3, id: free.toc[0]?.id });
    expect(screen.getAllByTestId('heading')[0]?.textContent).toBe(free.toc[0]?.text);

    expect(embeds.map((e) => e.service)).toEqual(free.embeds.map((e) => e.service));
    expect(embeds[3]?.embed).toEqual(free.embeds[3]);
    expect(screen.getAllByTestId('embed-external-article')[0]?.querySelector('a strong')).not.toBeNull();

    expect(tocs).toEqual([{ items: free.toc, linkableIds: free.toc.map((item) => item.id), title: '目次' }]);
    expect(container.querySelector('nav.nbk-toc')).toBeNull();
  });

  it('有料記事の toc には、本文に見出しがある項目の id だけを linkableIds で渡す', () => {
    const received: NoteBodyTocProps[] = [];
    render(
      <NoteArticleBody
        article={paid}
        labels={{ toc: 'もくじ' }}
        components={{
          toc: (props) => {
            received.push(props);
            return null;
          },
        }}
      />,
    );
    expect(received[0]?.items).toHaveLength(31);
    expect(received[0]?.linkableIds.length).toBeLessThan(31);
    expect(received[0]?.title).toBe('もくじ');
  });

  it('embeds にない埋め込みは embed: null で渡す', () => {
    const received: (NoteBodyEmbedProps['embed'] | undefined)[] = [];
    render(
      <NoteArticleBody
        article={withBody('<figure data-nbk-embed-service="note" data-nbk-embed-key="emb-missing"></figure>')}
        components={{
          embed: ({ embed }) => {
            received.push(embed);
            return null;
          },
        }}
      />,
    );
    expect(received).toEqual([null]);
  });
});

describe('NoteArticleBody：本文の変換', () => {
  const html = (bodyHtml: string) => renderToStaticMarkup(<NoteArticleBody article={withBody(bodyHtml)} />);

  it('許可しないタグは中身だけ、許可しない属性は捨てる', () => {
    expect(html('<p onclick="x" class="a" style="color:red">本文<span>中</span><script>alert(1)</script></p>')).toBe(
      '<div class="nbk-body"><p class="nbk-body__p">本文中alert(1)</p></div>',
    );
  });

  it('javascript: の href・http(s) でない画像・nbk- で始まらない id は描画しない', () => {
    const out = html(
      '<a href="javascript:alert(1)">a</a><a href="mailto:a@example.com">m</a><img src="data:image/png;base64,x" alt=""><h2 id="location">見出し</h2>',
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('data:');
    expect(out).not.toContain('id="location"');
    expect(out).toContain('href="mailto:a@example.com"');
    expect(out).not.toContain('<img');
  });

  it('実体参照を戻し、テキストとしてエスケープする', () => {
    expect(html('<p>&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39; &#x3042; &#12354;</p>')).toBe(
      '<div class="nbk-body"><p class="nbk-body__p">&lt;b&gt; &amp; &quot;x&quot; &#x27;y&#x27; あ あ</p></div>',
    );
  });

  it('壊れた入れ子でも落ちない', () => {
    expect(html('<p><strong>a</p>b</strong></em><ul><li>c')).toBe(
      '<div class="nbk-body"><p class="nbk-body__p"><strong>a</strong></p>b<ul class="nbk-body__ul"><li>c</li></ul></div>',
    );
  });

  it('#8 のサニタイズのケースを通した出力から、危険なものが出ない', () => {
    for (const c of [...UNSAFE_CASES, ...PRESERVE_CASES]) {
      const out = html(sanitizeNoteBody(c.input)).toLowerCase();
      for (const s of ['<script', 'javascript:', 'onerror', 'onclick', '<iframe', '<svg', 'srcdoc', 'style=']) {
        expect(out, c.name).not.toContain(s);
      }
    }
  });

  it('サニタイズしていない入力を渡されても、危険なものを描画しない', () => {
    for (const c of UNSAFE_CASES) {
      const out = html(c.input).toLowerCase();
      for (const s of ['<script', 'javascript:', ' onerror=', ' onclick=', '<iframe', '<svg', 'srcdoc', 'style=']) {
        expect(out, c.name).not.toContain(s);
      }
    }
  });
});
