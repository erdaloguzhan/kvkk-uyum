import type { NextRequest, NextResponse } from 'next/server';

/**
 * Web sunucusu tarayıcı ile API arasında aracıdır: oturum belirteçleri tarayıcıda JavaScript'in
 * okuyamadığı (httpOnly) çerezlerde tutulur ve API'ye giden isteğe burada eklenir.
 */
export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const ACCESS_COOKIE = 'kvkk_at';
export const REFRESH_COOKIE = 'kvkk_rt';

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Web sunucusunun önündeki güvenilir vekil sunucu (yük dengeleyici) sayısı. Her vekil, kendisine bağlananın
 * adresini X-Forwarded-For listesinin sonuna ekler. Web sunucusuna bağlanan adres (peer-address.cjs'in
 * eklediği x-kvkk-peer) bu listenin sonuna konur; istemcinin gerçek adresi sondan bu sayı kadar öncedeki
 * kayıttır. Önde vekil yoksa (0) bağlantı adresinin kendisi kullanılır, istemcinin yazdığı
 * X-Forwarded-For değerleri dikkate alınmaz.
 */
const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0) || 0);

function clientIp(req: NextRequest): string | null {
  const list = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const peer = req.headers.get('x-kvkk-peer');
  if (peer) {
    const chain = [...list, peer];
    return normalizeIp(chain[Math.max(0, chain.length - 1 - TRUSTED_PROXY_HOPS)]);
  }
  // peer-address.cjs yüklenmeden çalışan geliştirme sunucusu (next dev): Next.js başlık yoksa bağlantı
  // adresini yazar.
  return normalizeIp(list[Math.max(0, list.length - Math.max(1, TRUSTED_PROXY_HOPS))]);
}

/** IPv4 adreslerinin IPv6 biçimini (::ffff:1.2.3.4) sadeleştirir. */
function normalizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
}

/** Tarayıcıdan gelen başlıklardan API'ye iletilecek olanlar. */
const FORWARDED_HEADERS = ['content-type', 'accept', 'user-agent', 'x-organization-id'];

export function forwardHeaders(req: NextRequest, accessToken?: string): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  // API hız sınırı ve sistem logu için gerçek istemci IP'si (istemcinin gönderdiği sahte değerler atılır).
  const ip = clientIp(req);
  if (ip) headers.set('x-forwarded-for', ip);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return headers;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

function cookieOptions(req: NextRequest, maxAge: number) {
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge };
}

export function setSessionCookies(req: NextRequest, res: NextResponse, tokens: TokenPair) {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(req, tokens.expiresInSeconds));
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(req, REFRESH_MAX_AGE));
}

export function clearSessionCookies(req: NextRequest, res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', cookieOptions(req, 0));
  res.cookies.set(REFRESH_COOKIE, '', cookieOptions(req, 0));
}

/**
 * Yol parçalarını API adresine ekler. "." ve ".." parçaları (ör. %2e%2e) reddedilir: aksi halde istek
 * aracının izin verdiği yolun dışına (ör. /api/session'a ayrılmış uç noktalara) çıkabilir.
 */
export function apiPath(segments: string[]): string | null {
  if (segments.some((s) => s === '.' || s === '..')) return null;
  return segments.map(encodeURIComponent).join('/');
}

/** API yanıtından tarayıcıya iletilecek başlıklar (ek dosyalarındaki CSP ve nosniff korunur). */
export const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-security-policy', 'x-content-type-options'];

/** API'ye ulaşılamadığında Türkçe hata. */
export function apiUnavailable() {
  return Response.json({ message: 'Sunucuya ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.' }, { status: 502 });
}
