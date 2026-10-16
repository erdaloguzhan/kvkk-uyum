import PDFDocument from 'pdfkit';
import path from 'node:path';

// Türkçe karakterler (ğ, ş, ı, İ...) için gömülü yazı tipi; PDF'in standart yazı tiplerinde bu harfler yok.
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

export interface CertificateData {
  fullName: string;
  nationalId: string;
  organizationName: string;
  trainingName: string;
  trainerName: string | null;
  completedAt: Date;
  score: number;
}

const formatDate = (d: Date) =>
  d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Eğitimi başarıyla tamamlayan katılımcının sertifikası (A4 yatay PDF). */
export function certificatePdf(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: { Title: `Sertifika - ${data.fullName}`, Author: 'KVK Yönetim Sistemi' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', REGULAR);
    doc.registerFont('bold', BOLD);
    const { width, height } = doc.page;
    const navy = '#1f3a5f';

    doc.lineWidth(6).strokeColor(navy).rect(24, 24, width - 48, height - 48).stroke();
    doc.lineWidth(1.5).strokeColor('#b08d3c').rect(38, 38, width - 76, height - 76).stroke();

    const text = (value: string, y: number, font: string, size: number, color = '#222') =>
      doc.font(font).fontSize(size).fillColor(color).text(value, 70, y, { width: width - 140, align: 'center' });

    text('SERTİFİKA', 90, 'bold', 40, navy);
    text('Bu belge,', 165, 'regular', 14);
    text(data.fullName, 195, 'bold', 28, navy);
    text(`T.C. Kimlik No: ${data.nationalId}  ·  ${data.organizationName}`, 238, 'regular', 12, '#555');
    text('aşağıdaki eğitimi başarıyla tamamladığını gösterir.', 275, 'regular', 14);
    text(data.trainingName, 310, 'bold', 20, navy);
    text(`Tamamlama tarihi: ${formatDate(data.completedAt)}   ·   Sınav notu: ${data.score}`, 360, 'regular', 13);

    if (data.trainerName) {
      const x = width - 300;
      doc.lineWidth(0.8).strokeColor('#888').moveTo(x, height - 120).lineTo(x + 200, height - 120).stroke();
      doc.font('bold').fontSize(12).fillColor('#222').text(data.trainerName, x, height - 112, { width: 200, align: 'center' });
      doc.font('regular').fontSize(10).fillColor('#555').text('Eğitimci', x, height - 95, { width: 200, align: 'center' });
    }
    doc.font('regular').fontSize(9).fillColor('#888').text('KVK Yönetim Sistemi - Uzaktan Eğitim', 70, height - 70, {
      width: 300,
    });
    doc.end();
  });
}
