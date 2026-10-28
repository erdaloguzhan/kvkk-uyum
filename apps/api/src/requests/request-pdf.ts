import {
  DSR_ANSWER_METHODS,
  DSR_CHANNELS,
  DSR_FORM_CLOSING,
  DSR_FORM_CODE,
  DSR_FORM_INTRO,
  DSR_FORM_TITLE,
  DSR_FORM_VERIFICATION,
  DSR_OUTCOMES,
  DSR_RELATIONSHIPS,
  DSR_REQUEST_ITEMS,
  DSR_RESPONSE_METHODS,
  DsrAnswerMethod,
  DsrChannel,
  DsrOutcome,
  DsrRelationship,
  DsrRequestItem,
  DsrResponseMethod,
} from '@kvkk/shared';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { dateIn, formatDate } from '../workflow/dates';

// Türkçe karakterler ve kutucuk işaretleri (☐ ☒) için gömülü yazı tipi.
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

export interface RequestPdfData {
  organizationName: string;
  code: string;
  channel: DsrChannel;
  receivedAt: Date;
  fullName: string;
  nationalId: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  relationship: DsrRelationship | null;
  relationshipDetail: string | null;
  responseMethod: DsrResponseMethod | null;
  items: DsrRequestItem[];
  description: string | null;
  createdBy: { fullName: string } | null;
  answeredOn: string | null;
  answerOutcome: DsrOutcome | null;
  answerMethod: DsrAnswerMethod | null;
  answerSummary: string | null;
  answerRecordedBy: { fullName: string } | null;
}

const CHECKED = '☒';
const UNCHECKED = '☐';
const MARGIN = 50;
const black = '#111';
const grey = '#e8ecf1';

/**
 * Başvurunun FRM-010 Veri Sahibi Başvuru Formu düzeninde PDF'i (A4 dikey): giriş metni, veri sahibi bilgileri,
 * ilişki ve yanıt yöntemi seçimleri, talep tablosu ve beyan. Cevap kaydedildiyse sonunda cevap bilgisi yer alır.
 */
export function requestPdf(data: RequestPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: { Title: `${DSR_FORM_TITLE} - ${data.code}`, Author: 'KVK Uyum Yönetim Sistemi' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('regular', REGULAR);
    doc.registerFont('bold', BOLD);

    const width = doc.page.width - 2 * MARGIN;
    const bottom = () => doc.page.height - MARGIN;
    const ensure = (h: number) => {
      if (doc.y + h > bottom()) doc.addPage();
    };
    const paragraph = (text: string, opts: { size?: number; font?: string; gap?: number; align?: 'left' | 'justify' | 'center' } = {}) => {
      doc.font(opts.font ?? 'regular').fontSize(opts.size ?? 9).fillColor(black);
      ensure(doc.heightOfString(text, { width }) + 2);
      doc.text(text, MARGIN, doc.y, { width, align: opts.align ?? 'justify' });
      doc.moveDown(opts.gap ?? 0.5);
    };
    const heading = (text: string) => {
      doc.moveDown(0.3);
      ensure(40);
      const y = doc.y;
      doc.rect(MARGIN, y, width, 18).fill(grey);
      doc.font('bold').fontSize(10).fillColor(black).text(text, MARGIN + 6, y + 4, { width: width - 12 });
      doc.y = y + 22;
    };

    /** Satır yüksekliği içeriğe göre hesaplanan tablo; sığmazsa yeni sayfaya geçer. */
    const table = (cols: number[], rows: { cells: string[]; bold?: number[]; fill?: boolean }[], gap = 0.6) => {
      const pad = 4;
      for (const row of rows) {
        doc.fontSize(8.5);
        const heights = row.cells.map((c, i) => {
          doc.font(row.bold?.includes(i) ? 'bold' : 'regular');
          return doc.heightOfString(c || ' ', { width: cols[i] - 2 * pad });
        });
        const h = Math.max(...heights) + 2 * pad;
        ensure(h);
        const y = doc.y;
        let x = MARGIN;
        row.cells.forEach((c, i) => {
          if (row.fill) doc.rect(x, y, cols[i], h).fill(grey);
          doc.lineWidth(0.5).strokeColor('#555').rect(x, y, cols[i], h).stroke();
          doc
            .font(row.bold?.includes(i) ? 'bold' : 'regular')
            .fontSize(8.5)
            .fillColor(black)
            .text(c, x + pad, y + pad, { width: cols[i] - 2 * pad });
          x += cols[i];
        });
        doc.x = MARGIN;
        doc.y = y + h;
      }
      doc.moveDown(gap);
    };

    // Başlık
    table([width * 0.7, width * 0.3], [
      { cells: [data.organizationName, `Doküman No: ${DSR_FORM_CODE}`], bold: [0] },
      { cells: [DSR_FORM_TITLE.toLocaleUpperCase('tr'), `Başvuru No: ${data.code}`], bold: [0, 1] },
    ]);
    const receivedOn = dateIn(data.receivedAt);
    paragraph(`Başvuru tarihi: ${formatDate(receivedOn)} · Başvuru yolu: ${DSR_CHANNELS[data.channel]}`, { size: 8.5, align: 'left' });

    for (const p of DSR_FORM_INTRO) paragraph(p);

    heading('VERİ SAHİBİ BİLGİLERİ');
    const q = width / 4;
    table([q * 0.8, q * 1.2, q * 0.8, q * 1.2], [
      { cells: ['Ad Soyad', data.fullName, 'TC Kimlik Numarası', data.nationalId ?? ''], bold: [0, 2] },
      { cells: ['Doğum Tarihi', data.birthDate ? formatDate(data.birthDate) : '', 'Cep Telefonu', data.phone ?? ''], bold: [0, 2] },
    ], 0);
    table([q * 0.8, q * 3.2], [
      { cells: ['E-posta (varsa)', data.email ?? ''], bold: [0] },
      { cells: ['Adres', data.address ?? ''], bold: [0] },
    ]);

    for (const p of DSR_FORM_VERIFICATION) paragraph(p);

    heading('İŞYERİMİZ İLE OLAN İLİŞKİNİZ VE YANIT YÖNTEMİ');
    const relationship = (Object.keys(DSR_RELATIONSHIPS) as DsrRelationship[])
      .map((k) => {
        const mark = data.relationship === k ? CHECKED : UNCHECKED;
        const def = DSR_RELATIONSHIPS[k];
        const detail = data.relationship === k && data.relationshipDetail && 'detail' in def ? ` (${def.detail}: ${data.relationshipDetail})` : '';
        return `${mark} ${def.label}${detail}`;
      })
      .join('\n');
    const method = (Object.keys(DSR_RESPONSE_METHODS) as DsrResponseMethod[])
      .map((k) => `${data.responseMethod === k ? CHECKED : UNCHECKED} ${DSR_RESPONSE_METHODS[k].label}`)
      .join('\n');
    table([width / 2, width / 2], [
      {
        cells: ['Lütfen işyerimiz ile olan ilişkinizi belirtiniz.', 'Başvurunuza vereceğimiz yanıtın tarafınıza bildirilme yöntemi'],
        bold: [0, 1],
        fill: true,
      },
      { cells: [relationship, method] },
    ]);

    heading('KANUN KAPSAMINDAKİ TALEBİNİZ');
    if (data.description) paragraph(data.description, { align: 'left' });
    const selected = new Map(data.items.map((i) => [i.no, i]));
    table(
      [width * 0.09, width * 0.61, width * 0.3],
      [
        { cells: ['Talep No', 'Talep Konusu', 'Seçiminiz'], bold: [0, 1, 2], fill: true },
        ...DSR_REQUEST_ITEMS.map((def) => {
          const item = selected.get(def.no);
          const topic = def.options
            ? `${def.text}\n${Object.entries(def.options)
                .map(([k, v]) => `${k}) ${v}`)
                .join('\n')}${def.article ? `\n${def.article}` : ''}`
            : `${def.text}${def.article ? `\n${def.article}` : ''}`;
          let choice = item ? CHECKED : UNCHECKED;
          if (item?.option) choice += ` ${item.option})`;
          if (item?.detail && def.detailLabel) choice += `\n${def.detailLabel}: ${item.detail}`;
          return { cells: [String(def.no), topic, choice] };
        }),
      ],
    );

    paragraph(DSR_FORM_CLOSING);
    table([width / 2, width / 2], [
      {
        cells: [
          `Başvuruyu yapanın Adı Soyadı: ${data.fullName}\nBaşvuru Tarihi: ${formatDate(receivedOn)}`,
          data.channel === 'web_form' ? 'İmza: Online form ile elektronik olarak gönderildi' : 'İmza:',
        ],
      },
      {
        cells: [
          `Başvuruyu alanın Adı Soyadı: ${data.createdBy?.fullName ?? (data.channel === 'web_form' ? 'Online başvuru formu (sistem kaydı)' : '')}`,
          'İmza:',
        ],
      },
    ]);

    if (data.answeredOn && data.answerOutcome) {
      heading('BAŞVURUNUN SONUCU');
      table([width * 0.3, width * 0.7], [
        { cells: ['Cevap tarihi', formatDate(data.answeredOn)], bold: [0] },
        { cells: ['Sonuç', DSR_OUTCOMES[data.answerOutcome]], bold: [0] },
        { cells: ['Cevabın bildirilme yolu', data.answerMethod ? DSR_ANSWER_METHODS[data.answerMethod] : ''], bold: [0] },
        { cells: ['Veri sorumlusunun açıklamaları', data.answerSummary ?? ''], bold: [0] },
        { cells: ['Kaydeden', data.answerRecordedBy?.fullName ?? ''], bold: [0] },
      ]);
    }
    doc.end();
  });
}
