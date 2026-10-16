import type { Response } from 'express';

/** Dosyayı indirme olarak gönderir (Türkçe karakterli dosya adı için RFC 5987 biçimi de eklenir). */
export function sendFile(res: Response, content: Buffer, fileName: string, type: string) {
  const asciiName = fileName.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
  res
    .type(type)
    .set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    .send(content);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
