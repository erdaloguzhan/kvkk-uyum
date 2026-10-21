import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Tarayıcıya verilen güvenlik kuralları (CSP): sayfa yalnızca kendi sunucusundan betik, stil ve veri yükler;
 * başka bir site bu sayfaları çerçeve içinde açamaz. Cloudflare Turnstile (CAPTCHA) için kendi adresine
 * izin verilir. Next.js sayfaya satır içi betik eklediği için 'unsafe-inline' gereklidir; geliştirme
 * sunucusu ayrıca 'unsafe-eval' ister.
 */
const TURNSTILE = 'https://challenges.cloudflare.com';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // Ders anlatımlarında başka sitelerdeki (https) görseller de gösterilebilir.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${TURNSTILE}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // Docker imajı için yalnızca gerekli dosyaları içeren bağımsız çıktı.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
