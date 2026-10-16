import { Fragment, ReactNode } from 'react';

/**
 * Ders anlatımı için küçük Markdown görüntüleyici. HTML üretmez, React öğeleri üretir; bu yüzden içerikteki
 * <script> vb. metin olarak görünür. Desteklenenler: # başlık, - madde, 1. numaralı madde, > alıntı,
 * **kalın**, *italik*, [bağlantı](https://…) ve ![görsel](adres).
 */
export function Markdown({ source }: { source: string }) {
  return <div className="markdown">{blocks(source)}</div>;
}

const SAFE_URL = /^(https?:\/\/|\/api\/v1\/training-media\/)/i;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[2] !== undefined) {
      // eslint-disable-next-line @next/next/no-img-element
      out.push(SAFE_URL.test(m[2]) ? <img key={key} src={m[2]} alt={m[1]} /> : m[0]);
    } else if (m[4] !== undefined) {
      out.push(
        SAFE_URL.test(m[4]) ? (
          <a key={key} href={m[4]} target="_blank" rel="noopener noreferrer">
            {m[3]}
          </a>
        ) : (
          m[0]
        ),
      );
    } else if (m[5] !== undefined) {
      out.push(<strong key={key}>{inline(m[5], key)}</strong>);
    } else {
      out.push(<em key={key}>{inline(m[6], key)}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(items: string[], key: string) {
  return items.map((l, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 && <br />}
      {inline(l, `${key}-${i}`)}
    </Fragment>
  ));
}

function blocks(source: string): ReactNode[] {
  const rows = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < rows.length) {
    const line = rows[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2], key);
      out.push(level === 1 ? <h2 key={key}>{content}</h2> : level === 2 ? <h3 key={key}>{content}</h3> : <h4 key={key}>{content}</h4>);
      i++;
      continue;
    }
    const listRe = /^\s*([-*]|\d+[.)])\s+(.*)$/;
    const first = listRe.exec(line);
    if (first) {
      const ordered = /\d/.test(first[1]);
      const items: string[] = [];
      let m: RegExpExecArray | null;
      while (i < rows.length && (m = listRe.exec(rows[i])) && /\d/.test(m[1]) === ordered) {
        items.push(m[2]);
        i++;
      }
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>);
      out.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < rows.length && rows[i].startsWith('>')) quote.push(rows[i++].replace(/^>\s?/, ''));
      out.push(<blockquote key={key}>{lines(quote, key)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < rows.length && rows[i].trim() && !/^(#{1,3})\s/.test(rows[i]) && !listRe.test(rows[i]) && !rows[i].startsWith('>')) {
      para.push(rows[i++]);
    }
    out.push(<p key={key}>{lines(para, key)}</p>);
  }
  return out;
}
