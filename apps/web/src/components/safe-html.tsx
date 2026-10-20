'use client';

import { createElement, ReactNode, useMemo } from 'react';

/** Word belgesinden üretilen HTML'de gösterilen etiketler; diğerlerinin yalnızca metni gösterilir. */
const TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'br',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'a', 'img',
]);
const SAFE_LINK = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

function convert(node: Node, key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map((c, i) => convert(c, `${key}-${i}`));
  if (!TAGS.has(tag)) return children;
  if (tag === 'br') return <br key={key} />;
  if (tag === 'img') {
    const src = el.getAttribute('src') ?? '';
    // eslint-disable-next-line @next/next/no-img-element
    return SAFE_IMAGE.test(src) ? <img key={key} src={src} alt={el.getAttribute('alt') ?? ''} /> : null;
  }
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? '';
    // Belge içi yer imleri ve güvenli olmayan adresler bağlantı olmadan metin olarak gösterilir.
    if (!SAFE_LINK.test(href)) return children.length ? <span key={key}>{children}</span> : null;
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  const props: Record<string, unknown> = { key };
  if (tag === 'td' || tag === 'th') {
    for (const attr of ['colspan', 'rowspan'] as const) {
      const n = Number(el.getAttribute(attr));
      if (Number.isInteger(n) && n > 1 && n < 100) props[attr === 'colspan' ? 'colSpan' : 'rowSpan'] = n;
    }
  }
  return createElement(tag, props, ...children);
}

/**
 * Sunucudan gelen HTML'i doğrudan sayfaya basmadan, izin verilen etiketlerden React öğeleri üreterek gösterir.
 * Öznitelikler (style, onclick vb.) atılır; yalnızca güvenli bağlantılar ve gömülü resimler kalır.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const content = useMemo(() => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.body.childNodes).map((n, i) => convert(n, String(i)));
  }, [html]);
  return <div className={className}>{content}</div>;
}
