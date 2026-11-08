// KVKK Farkındalık Eğitimi alt konu görsellerini (1200x500 PNG) üretir.
// Çalıştırma (Playwright kurulu bir makinede): node tools/egitim-gorselleri/uret.mjs
// Çıktı: apps/api/assets/egitim/kvkk-farkindalik/01.png … 17.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'apps/api/assets/egitim/kvkk-farkindalik');

const C = {
  navy: '#15314f',
  blue: '#1f5fa8',
  sky: '#7fb0e6',
  soft: '#e6eef8',
  teal: '#2bb3a3',
  amber: '#f2b33d',
  coral: '#e5675d',
  white: '#ffffff',
  gray: '#c9d6e4',
};

const check = (x, y, s = 1, color = C.white) =>
  `<path d="M${x - 14 * s} ${y} l${10 * s} ${10 * s} l${20 * s} -${22 * s}" fill="none" stroke="${color}" stroke-width="${7 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
const lock = (x, y, s = 1) => `
  <path d="M${x - 22 * s} ${y - 4 * s} v-${16 * s} a${22 * s} ${22 * s} 0 0 1 ${44 * s} 0 v${16 * s}" fill="none" stroke="${C.navy}" stroke-width="${8 * s}"/>
  <rect x="${x - 34 * s}" y="${y - 6 * s}" width="${68 * s}" height="${54 * s}" rx="${9 * s}" fill="${C.amber}"/>
  <circle cx="${x}" cy="${y + 16 * s}" r="${7 * s}" fill="${C.navy}"/><rect x="${x - 3 * s}" y="${y + 18 * s}" width="${6 * s}" height="${14 * s}" fill="${C.navy}"/>`;
const shield = (x, y, s = 1, fill = C.blue) =>
  `<path d="M${x} ${y - 95 * s} L${x + 80 * s} ${y - 65 * s} V${y + 5 * s} C${x + 80 * s} ${y + 60 * s} ${x + 40 * s} ${y + 90 * s} ${x} ${y + 105 * s} C${x - 40 * s} ${y + 90 * s} ${x - 80 * s} ${y + 60 * s} ${x - 80 * s} ${y + 5 * s} V${y - 65 * s} Z" fill="${fill}"/>`;
const person = (x, y, s = 1, fill = C.navy) =>
  `<circle cx="${x}" cy="${y - 38 * s}" r="${24 * s}" fill="${fill}"/><path d="M${x - 44 * s} ${y + 46 * s} a${44 * s} ${50 * s} 0 0 1 ${88 * s} 0 Z" fill="${fill}"/>`;
const lines = (x, y, w, n, gap = 26, color = C.gray, h = 10) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="${h}" rx="${h / 2}" fill="${color}"/>`).join('');
const doc = (x, y, w, h, fill = C.white) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${C.navy}" stroke-width="5"/>`;
const text = (x, y, t, size, fill = C.navy, weight = 800) =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${t}</text>`;

// Her konu için 600,250 merkezli sahne.
const scenes = [
  // 1 Kişisel veri ve özel nitelikli veri: kimlik kartı + kalpli kalkan
  `<rect x="400" y="140" width="300" height="190" rx="22" fill="${C.white}" stroke="${C.navy}" stroke-width="6"/>
   <rect x="400" y="140" width="300" height="44" rx="22" fill="${C.blue}"/><rect x="400" y="162" width="300" height="22" fill="${C.blue}"/>
   ${person(475, 268, 0.85, C.sky)}${lines(540, 225, 130, 4)}
   ${shield(760, 300, 0.75, C.teal)}<path d="M760 345 c-40 -28 -52 -48 -38 -64 c12 -14 30 -8 38 6 c8 -14 26 -20 38 -6 c14 16 2 36 -38 64z" fill="${C.white}"/>`,
  // 2 Mevzuat: kitap + terazi
  `<rect x="380" y="150" width="190" height="230" rx="14" fill="${C.blue}"/><rect x="392" y="162" width="166" height="206" rx="8" fill="${C.navy}"/>
   ${text(475, 265, '§', 110, C.amber)}${text(475, 330, '6698', 34, C.white)}
   <rect x="716" y="120" width="10" height="250" fill="${C.navy}"/><rect x="660" y="365" width="122" height="20" rx="8" fill="${C.navy}"/>
   <rect x="620" y="150" width="202" height="10" rx="5" fill="${C.navy}"/><circle cx="721" cy="140" r="16" fill="${C.amber}"/>
   <path d="M640 160 l-34 90 h68 z M802 160 l-34 90 h68 z" fill="none" stroke="${C.navy}" stroke-width="4"/>
   <path d="M600 250 a40 22 0 0 0 80 0z M762 250 a40 22 0 0 0 80 0z" fill="${C.teal}"/>`,
  // 3 İşlenme şartları: pano üzerinde liste
  `<rect x="460" y="110" width="280" height="290" rx="22" fill="${C.white}" stroke="${C.navy}" stroke-width="6"/>
   <rect x="545" y="92" width="110" height="40" rx="12" fill="${C.navy}"/>
   ${[0, 1, 2, 3].map((i) => `<circle cx="515" cy="${180 + i * 58}" r="20" fill="${i < 3 ? C.teal : C.gray}"/>${i < 3 ? check(515, 180 + i * 58, 0.6) : ''}<rect x="550" y="${174 + i * 58}" width="${i % 2 ? 130 : 160}" height="13" rx="6" fill="${C.gray}"/>`).join('')}`,
  // 4 Özel nitelikli: kilitli kalkan + nabız
  `${shield(600, 250, 1.4, C.navy)}${shield(600, 250, 1.15, C.blue)}
   <path d="M470 250 h60 l20 -40 l30 85 l25 -70 l18 25 h107" fill="none" stroke="${C.coral}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
   ${lock(600, 330, 0.9)}`,
  // 5 Cezalar: tokmak + TL madeni para
  `<rect x="420" y="355" width="230" height="30" rx="10" fill="${C.navy}"/><rect x="455" y="330" width="160" height="28" rx="8" fill="${C.blue}"/>
   <g transform="rotate(-35 520 220)"><rect x="440" y="180" width="160" height="70" rx="16" fill="${C.navy}"/><rect x="425" y="170" width="26" height="90" rx="8" fill="${C.amber}"/><rect x="590" y="170" width="26" height="90" rx="8" fill="${C.amber}"/><rect x="510" y="250" width="22" height="150" rx="8" fill="${C.blue}"/></g>
   <circle cx="760" cy="230" r="90" fill="${C.amber}"/><circle cx="760" cy="230" r="70" fill="none" stroke="${C.white}" stroke-width="6"/>
   ${text(760, 262, '₺', 96, C.navy)}`,
  // 6 Terimler: A-Z sözlük
  `<path d="M600 140 C540 115 470 115 410 135 V370 C470 350 540 350 600 375 Z" fill="${C.white}" stroke="${C.navy}" stroke-width="6"/>
   <path d="M600 140 C660 115 730 115 790 135 V370 C730 350 660 350 600 375 Z" fill="${C.soft}" stroke="${C.navy}" stroke-width="6"/>
   ${text(505, 270, 'A', 110, C.blue)}${text(695, 270, 'Z', 110, C.teal)}
   ${lines(455, 300, 100, 2, 22)}${lines(645, 300, 100, 2, 22)}`,
  // 7 Açık rıza: belge + onay damgası + kalem
  `${doc(430, 110, 240, 300)}${lines(465, 160, 170, 6, 30)}
   <circle cx="690" cy="340" r="70" fill="${C.teal}"/>${check(690, 338, 1.6)}
   <g transform="rotate(35 790 200)"><rect x="775" y="110" width="30" height="170" rx="8" fill="${C.amber}"/><path d="M775 280 h30 l-15 34z" fill="${C.navy}"/></g>`,
  // 8 Aydınlatma: hoparlör + bilgi işareti belgesi
  `<path d="M420 210 h50 l90 -60 v200 l-90 -60 h-50 z" fill="${C.blue}"/>
   <path d="M590 190 a70 70 0 0 1 0 120 M615 160 a110 110 0 0 1 0 180" fill="none" stroke="${C.sky}" stroke-width="12" stroke-linecap="round"/>
   ${doc(670, 120, 170, 240)}<circle cx="755" cy="185" r="34" fill="${C.amber}"/>${text(755, 204, 'i', 52, C.navy)}${lines(700, 245, 110, 4, 26)}`,
  // 9 Haklar: kişi + haklar listesi
  `${person(470, 270, 1.6, C.blue)}
   ${doc(600, 110, 230, 290)}
   ${[0, 1, 2, 3, 4].map((i) => `<circle cx="640" cy="${160 + i * 50}" r="14" fill="${C.teal}"/>${check(640, 160 + i * 50, 0.4)}<rect x="666" y="${154 + i * 50}" width="${i % 2 ? 110 : 140}" height="12" rx="6" fill="${C.gray}"/>`).join('')}`,
  // 10 Neden gerekli: kişiyi koruyan kalkan, çevrede veri ikonları
  `${shield(600, 250, 1.5, C.blue)}${person(600, 265, 1.1, C.white)}
   ${[[420, 150], [780, 150], [400, 330], [800, 330]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="30" fill="${C.soft}" stroke="${C.sky}" stroke-width="5"/><rect x="${x - 14}" y="${y - 4}" width="28" height="8" rx="4" fill="${C.sky}"/>`).join('')}`,
  // 11 Kimler tabi: bina + kişiler
  `<rect x="520" y="120" width="160" height="260" rx="10" fill="${C.navy}"/>
   ${[0, 1, 2, 3].map((r) => [0, 1].map((c) => `<rect x="${548 + c * 62}" y="${145 + r * 52}" width="42" height="30" rx="4" fill="${C.sky}"/>`).join('')).join('')}
   <rect x="580" y="335" width="40" height="45" rx="4" fill="${C.amber}"/>
   ${person(440, 330, 1, C.blue)}${person(760, 330, 1, C.teal)}${person(370, 345, 0.75, C.sky)}${person(830, 345, 0.75, C.sky)}`,
  // 12 Veri güvenliği: sunucu + kalkan + kilit
  `${[0, 1, 2].map((i) => `<rect x="410" y="${135 + i * 78}" width="230" height="62" rx="12" fill="${C.navy}"/><circle cx="440" cy="${166 + i * 78}" r="8" fill="${C.teal}"/><circle cx="465" cy="${166 + i * 78}" r="8" fill="${C.amber}"/>${lines(495, 160 + i * 78, 115, 1, 0, C.blue, 12)}`).join('')}
   ${shield(760, 260, 1, C.teal)}${lock(760, 255, 0.9)}`,
  // 13 İşleme: veritabanı + döngü okları
  `<ellipse cx="600" cy="150" rx="110" ry="34" fill="${C.sky}"/><path d="M490 150 v190 a110 34 0 0 0 220 0 v-190 a110 34 0 0 1 -220 0z" fill="${C.blue}"/>
   <path d="M490 215 a110 34 0 0 0 220 0 M490 280 a110 34 0 0 0 220 0" fill="none" stroke="${C.sky}" stroke-width="6"/>
   <path d="M390 250 a210 150 0 0 1 120 -150" fill="none" stroke="${C.teal}" stroke-width="12" stroke-linecap="round"/><path d="M500 80 l30 18 l-34 16z" fill="${C.teal}"/>
   <path d="M810 250 a210 150 0 0 1 -120 150" fill="none" stroke="${C.amber}" stroke-width="12" stroke-linecap="round"/><path d="M700 420 l-30 -18 l34 -16z" fill="${C.amber}"/>`,
  // 14 Temel ilkeler: beş sütunlu yapı
  `<path d="M400 175 L600 95 L800 175 Z" fill="${C.navy}"/><rect x="400" y="175" width="400" height="22" fill="${C.blue}"/>
   ${[0, 1, 2, 3, 4].map((i) => `<rect x="${425 + i * 76}" y="205" width="44" height="150" rx="6" fill="${[C.teal, C.sky, C.amber, C.sky, C.teal][i]}"/>`).join('')}
   <rect x="385" y="360" width="430" height="26" rx="6" fill="${C.navy}"/>`,
  // 15 Aleni: göz + açık pano
  `<rect x="410" y="120" width="380" height="250" rx="22" fill="${C.white}" stroke="${C.navy}" stroke-width="6"/>
   <path d="M460 245 C520 165 680 165 740 245 C680 325 520 325 460 245Z" fill="${C.soft}" stroke="${C.blue}" stroke-width="8"/>
   <circle cx="600" cy="245" r="48" fill="${C.blue}"/><circle cx="600" cy="245" r="20" fill="${C.navy}"/><circle cx="614" cy="232" r="8" fill="${C.white}"/>
   <rect x="585" y="370" width="30" height="40" fill="${C.navy}"/>`,
  // 16 Anonim: soru işaretli silüet + maske
  `${person(600, 290, 2.1, C.gray)}
   <rect x="535" y="175" width="130" height="34" rx="17" fill="${C.navy}"/>
   ${text(600, 390, '?', 80, C.blue)}
   ${[[450, 150], [760, 170], [430, 320], [780, 320]].map(([x, y]) => `<rect x="${x - 26}" y="${y - 10}" width="52" height="20" rx="10" fill="${C.soft}" stroke="${C.sky}" stroke-width="4" stroke-dasharray="6 6"/>`).join('')}`,
  // 17 VERBİS: sicil defteri + büyüteç
  `<rect x="420" y="115" width="250" height="290" rx="18" fill="${C.blue}"/><rect x="440" y="115" width="18" height="290" fill="${C.navy}"/>
   <rect x="480" y="160" width="160" height="56" rx="10" fill="${C.white}"/>${text(560, 199, 'VERBİS', 30, C.navy)}
   ${lines(480, 250, 160, 4, 30, C.sky)}
   <circle cx="740" cy="270" r="70" fill="${C.soft}" stroke="${C.navy}" stroke-width="14"/><rect x="785" y="320" width="26" height="90" rx="10" transform="rotate(-45 798 365)" fill="${C.amber}"/>
   ${check(740, 268, 1.3, C.teal)}`,
];

const svg = (scene, n) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef4fb"/><stop offset="1" stop-color="#dbe8f6"/></linearGradient></defs>
  <rect width="1200" height="500" fill="url(#bg)"/>
  <circle cx="110" cy="420" r="170" fill="${C.white}" opacity="0.55"/><circle cx="1110" cy="70" r="150" fill="${C.white}" opacity="0.55"/>
  <circle cx="1040" cy="400" r="60" fill="${C.sky}" opacity="0.18"/><circle cx="170" cy="90" r="40" fill="${C.teal}" opacity="0.15"/>
  <ellipse cx="600" cy="420" rx="300" ry="22" fill="${C.navy}" opacity="0.07"/>
  ${scene}
  <g><rect x="40" y="36" width="112" height="44" rx="22" fill="${C.navy}"/>${text(96, 66, `Konu ${n}`, 20, C.white, 700)}</g>
</svg>`;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 500 }, deviceScaleFactor: 1 });
for (const [i, scene] of scenes.entries()) {
  const n = i + 1;
  await page.setContent(`<html><body style="margin:0">${svg(scene, n)}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(out, `${String(n).padStart(2, '0')}.png`) });
}
await browser.close();
console.log(`${scenes.length} görsel: ${out}`);
