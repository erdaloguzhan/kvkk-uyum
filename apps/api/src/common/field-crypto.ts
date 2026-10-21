import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Veritabanında şifreli tutulan alanlar (ör. T.C. kimlik no) için AES-256-GCM şifreleme.
 * Anahtar DATA_ENCRYPTION_KEY ortam değişkenindedir (32 bayt, base64). Anahtar kaybolursa şifreli veriler
 * okunamaz; yedeklerle birlikte ayrı ve güvenli bir yerde saklanmalıdır.
 *
 * Şifreli değer her seferinde farklı olduğundan eşitlik araması ve tekillik için ayrıca anahtarlı bir
 * özet (HMAC-SHA256, "blind index") tutulur.
 */
const PREFIX = 'enc:v1:';

let keys: { enc: Buffer; mac: Buffer } | undefined;

export function parseDataKey(value: string | undefined): Buffer {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY 32 baytlık base64 bir değer olmalı (üretmek için: openssl rand -base64 32)');
  }
  return key;
}

function getKeys() {
  if (!keys) {
    const master = parseDataKey(process.env.DATA_ENCRYPTION_KEY);
    const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
    keys = { enc: derive('kvkk-field-enc-v1'), mac: derive('kvkk-field-mac-v1') };
  }
  return keys;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKeys().enc, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

/** Şifreli değeri çözer. Henüz şifrelenmemiş eski bir değer (migration öncesi) olduğu gibi döner. */
export function decryptField(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', getKeys().enc, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Şifreli alanda arama ve tekillik için anahtarlı özet. */
export function blindIndex(plain: string): string {
  return createHmac('sha256', getKeys().mac).update(plain).digest('hex');
}
