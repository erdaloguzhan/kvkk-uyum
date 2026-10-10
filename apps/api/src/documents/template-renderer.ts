import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { OPTIONAL_PLACEHOLDERS } from '@kvkk/shared';

/** Şablonlarda geçen ama henüz desteklenmeyen yer tutucular; boş bırakılır ve sürümde not edilir. */
export const UNSUPPORTED_PLACEHOLDERS = ['kurum.logo'];

export interface RenderResult {
  content: Buffer;
  /** Kuruluş profilinde boş olduğu için doldurulamayan zorunlu yer tutucular. */
  missing: string[];
  /** Desteklenmediği için boş bırakılan yer tutucular. */
  unfilled: string[];
}

/**
 * `.docx` şablonundaki `{{kurum.unvan}}` gibi yer tutucuları verilen değerlerle doldurur.
 * Yalnızca yer tutucular değişir; dokümanın geri kalanı (başlıktaki yayın tarihi, revizyon no dahil)
 * şablondaki haliyle kalır.
 */
export function renderTemplate(template: Buffer, values: Record<string, string | null | undefined>): RenderResult {
  const missing = new Set<string>();
  const unfilled = new Set<string>();
  const doc = new Docxtemplater(new PizZip(template), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    parser: (raw: string) => {
      const tag = raw.trim();
      return {
        get: () => {
          if (UNSUPPORTED_PLACEHOLDERS.includes(tag)) {
            unfilled.add(tag);
            return '';
          }
          const value = values[tag];
          if (value == null || value.trim() === '') {
            // Zorunlu olmayan alanlar (KEP, web sitesi) boşsa yer tutucu boş kalır.
            if (!OPTIONAL_PLACEHOLDERS.includes(tag)) missing.add(tag);
            return '';
          }
          return value;
        },
      };
    },
  });
  doc.render({});
  const content = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  return { content, missing: [...missing].sort(), unfilled: [...unfilled].sort() };
}

/** Yüklenen dosyanın açılabilir bir Word (.docx) dokümanı olup olmadığını kontrol eder. */
export function isDocx(file: Buffer): boolean {
  try {
    return new PizZip(file).file('word/document.xml') != null;
  } catch {
    return false;
  }
}
