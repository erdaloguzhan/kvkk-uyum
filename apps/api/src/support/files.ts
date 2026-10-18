import type { Response } from 'express';
import type { UploadedAttachment } from './support.service';

export const toAttachments = (files: Express.Multer.File[] | undefined): UploadedAttachment[] =>
  (files ?? []).map((f) => ({
    // Multer dosya adını latin1 olarak çözer; Türkçe karakterler için UTF-8'e çevrilir.
    fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    mimeType: f.mimetype,
    content: f.buffer,
  }));

/** Görseller sayfada gösterilir (inline), PDF indirilir. İçerik türü yüklemede doğrulanmıştır. */
export function sendAttachment(res: Response, a: { fileName: string; mimeType: string; content: Buffer }) {
  const asciiName = a.fileName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
  const disposition = a.mimeType.startsWith('image/') ? 'inline' : 'attachment';
  res
    .type(a.mimeType)
    .set('Content-Disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(a.fileName)}`)
    .set('Content-Security-Policy', "default-src 'none'; sandbox")
    .set('Cache-Control', 'private, max-age=3600')
    .send(a.content);
}
