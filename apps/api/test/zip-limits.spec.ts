import PizZip from 'pizzip';
import { zipWithinLimits } from '../src/common/zip-limits';

const zip = (files: Record<string, string | Buffer>) => {
  const z = new PizZip();
  for (const [name, content] of Object.entries(files)) z.file(name, content);
  return z.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
};

describe('Yüklenen ZIP (docx/xlsx) sınırları', () => {
  it('normal arşivi kabul eder', () => {
    expect(zipWithinLimits(zip({ 'word/document.xml': '<w:document/>', 'a.txt': 'merhaba' }))).toBe(true);
  });

  it('açılınca sınırı aşan arşivi (zip bombası) reddeder', () => {
    // 2 MB sıfır yaklaşık 2 KB'a sıkışır; sınır 1 MB verilince reddedilmeli.
    const bomb = zip({ 'xl/worksheets/sheet1.xml': Buffer.alloc(2 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(20_000);
    expect(zipWithinLimits(bomb, 1024 * 1024)).toBe(false);
    expect(zipWithinLimits(bomb, 3 * 1024 * 1024)).toBe(true);
  });

  it('ZIP olmayan veya kesik dosyayı reddeder', () => {
    expect(zipWithinLimits(Buffer.from('bu bir zip değil'))).toBe(false);
    expect(zipWithinLimits(Buffer.alloc(0))).toBe(false);
    const ok = zip({ 'a.txt': 'x' });
    expect(zipWithinLimits(ok.subarray(0, ok.length - 30))).toBe(false);
  });
});
