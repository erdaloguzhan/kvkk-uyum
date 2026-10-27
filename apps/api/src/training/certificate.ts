import PDFDocument from 'pdfkit';
import path from 'node:path';

// Türkçe karakterler (ğ, ş, ı, İ...) için gömülü yazı tipi; PDF'in standart yazı tiplerinde bu harfler yok.
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');
/** Erdal'ın "SERTİFİKA şablon.docx" dosyasındaki çerçeve görseli (25.10.2026). src ve dist'ten aynı göreli yolda. */
const FRAME = path.join(__dirname, '../../assets/sertifika-cerceve.jpg');

export interface CertificateData {
  fullName: string;
  nationalId: string;
  organizationName: string;
  trainingName: string;
  /** Eğitimin alt konu başlıkları; belgede madde madde listelenir. */
  topics: string[];
  trainerName: string | null;
  trainerTitle?: string | null;
  /** İmza görseli (PNG veya JPEG); yüklenirken PDF'e eklenebildiği doğrulanır. */
  trainerSignature?: Buffer | null;
  completedAt: Date;
}

const formatDate = (d: Date) =>
  d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Eğitimi başarıyla tamamlayan katılımcının katılım belgesi (A4 yatay PDF). Düzen Erdal'ın şablonundaki gibi:
 * çerçeve, başlık, katılımcı bilgileri tablosu, eğitim konuları ve "Eğitimi veren" (imza, ad, ünvan).
 */
export function certificatePdf(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: { Title: `Katılım Belgesi - ${data.fullName}`, Author: 'KVK Uyum Yönetim Sistemi' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', REGULAR);
    doc.registerFont('bold', BOLD);
    const { width, height } = doc.page;
    doc.image(FRAME, 0, 0, { width, height });

    // Çerçevenin içindeki beyaz alan yaklaşık x: 78-766, y: 83-514 pt.
    const left = 115;
    const inner = width - 2 * left;
    const black = '#111';
    const centered = (value: string, y: number, font: string, size: number) =>
      doc.font(font).fontSize(size).fillColor(black).text(value, left, y, { width: inner, align: 'center' });

    centered(`${data.trainingName.toLocaleUpperCase('tr')}\nKATILIM BELGESİ`, 108, 'bold', 16);

    // Katılımcı bilgileri tablosu (şablondaki gibi 4 sütun; son satırda unvan tüm genişlikte).
    const cols = [118, 180, 128, 160];
    const tableWidth = cols.reduce((a, b) => a + b, 0);
    const x0 = (width - tableWidth) / 2;
    const rowH = 21;
    let y = doc.y + 14;
    const cell = (value: string, x: number, w: number, font: string) => {
      doc.lineWidth(0.6).strokeColor(black).rect(x, y, w, rowH).stroke();
      doc.font(font).fontSize(9.5).fillColor(black).text(value, x + 5, y + 6, { width: w - 10, height: rowH - 6, ellipsis: true, lineBreak: false });
    };
    const row = (cells: [string, string, string?, string?]) => {
      let x = x0;
      if (cells.length === 2) {
        cell(cells[0], x, cols[0], 'bold');
        cell(cells[1], x + cols[0], tableWidth - cols[0], 'regular');
      } else {
        cells.forEach((value, i) => {
          cell(value ?? '', x, cols[i], i % 2 === 0 ? 'bold' : 'regular');
          x += cols[i];
        });
      }
      y += rowH;
    };
    row(['Adı Soyadı', data.fullName, 'T.C Kimlik Numarası', data.nationalId]);
    row(['Eğitim Tarihi', formatDate(data.completedAt), 'Eğitim Türü', 'Uzaktan Eğitim']);
    row(['Firma Ünvanı', data.organizationName]);

    y += 16;
    doc.font('regular').fontSize(11).fillColor(black);
    doc.text('Yukarıda bilgileri yazılı olan katılımcı, aşağıdaki konuları içeren', left, y, { width: inner, align: 'center' });
    // Eğitim adı kalın, devamı normal; pdfkit "continued" ile ortalamada kayıyor, bu yüzden genişlik elle ölçülür.
    const tail = ' eğitimini başarıyla tamamlamıştır.';
    const nameW = doc.font('bold').widthOfString(data.trainingName);
    const tailW = doc.font('regular').widthOfString(tail);
    const lineY = doc.y;
    if (nameW + tailW <= inner) {
      const sx = (width - nameW - tailW) / 2;
      doc.font('bold').text(data.trainingName, sx, lineY, { lineBreak: false });
      doc.font('regular').text(tail, sx + nameW, lineY, { lineBreak: false });
      doc.x = left;
      doc.y = lineY + doc.currentLineHeight(true);
    } else {
      doc.font('bold').text(data.trainingName, left, lineY, { width: inner, align: 'center' });
      doc.font('regular').text(tail.trim(), left, doc.y, { width: inner, align: 'center' });
    }

    // "Eğitimi veren" bölümü sayfanın altında sabit yerde; konular üstündeki alana sığdırılır.
    const trainerTop = 408;
    const topics = data.topics.slice(0, 20);
    const twoColumns = topics.length > 8;
    const perColumn = twoColumns ? Math.ceil(topics.length / 2) : topics.length;
    const colWidth = twoColumns ? 280 : 360;
    const listLeft = twoColumns ? (width - 2 * colWidth) / 2 : (width - colWidth) / 2 + 20;
    const listTop = doc.y + 10;
    const lineH = Math.min(14.5, (trainerTop - 10 - listTop) / Math.max(perColumn, 1));
    doc.font('regular').fontSize(Math.min(10.5, lineH * 0.72)).fillColor(black);
    topics.forEach((topic, i) => {
      const col = Math.floor(i / perColumn);
      const ty = listTop + (i % perColumn) * lineH;
      const tx = listLeft + col * colWidth;
      doc.circle(tx + 3, ty + lineH * 0.41, 1.8).fill(black);
      doc.fillColor(black).text(topic, tx + 12, ty, { width: colWidth - 20, height: lineH, ellipsis: true, lineBreak: false });
    });

    centered('EĞİTİMİ VEREN', trainerTop, 'bold', 11);
    const sigTop = trainerTop + 17;
    const sigBox = { w: 150, h: 40 };
    if (data.trainerSignature) {
      doc.image(data.trainerSignature, (width - sigBox.w) / 2, sigTop, { fit: [sigBox.w, sigBox.h], align: 'center', valign: 'center' });
    }
    if (data.trainerName) centered(data.trainerName, sigTop + sigBox.h + 3, 'regular', 11);
    if (data.trainerTitle) centered(data.trainerTitle, doc.y + 1, 'regular', 9.5);
    doc.end();
  });
}
