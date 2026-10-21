/**
 * Yüklenen .docx/.xlsx dosyaları ZIP arşividir. Küçük bir dosya açıldığında gigabaytlarca veriye
 * dönüşebilir (zip bombası) ve sunucunun belleğini doldurur. Dosya açılmadan önce arşivin içindekiler
 * listesinden (central directory) toplam açılmış boyut ve dosya sayısı kontrol edilir.
 */
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Arşiv sınırlar içindeyse true; ZIP değilse, bozuksa veya ZIP64 ise false. */
export function zipWithinLimits(file: Buffer, maxBytes = MAX_UNCOMPRESSED_BYTES): boolean {
  // Arşiv sonu kaydı dosyanın son 22 baytında başlar; sonunda en fazla 65535 baytlık açıklama olabilir.
  let eocd = -1;
  for (let i = file.length - 22; i >= Math.max(0, file.length - 22 - 0xffff); i--) {
    if (file.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return false;
  const count = file.readUInt16LE(eocd + 10);
  let offset = file.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === 0xffffffff || count > MAX_ENTRIES) return false;

  let total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > file.length || file.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return false;
    const size = file.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return false;
    total += size;
    if (total > maxBytes) return false;
    offset += 46 + file.readUInt16LE(offset + 28) + file.readUInt16LE(offset + 30) + file.readUInt16LE(offset + 32);
  }
  return true;
}
