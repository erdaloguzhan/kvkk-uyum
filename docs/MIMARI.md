# KVK Yönetim Sistemi — Mimari Plan

Sürüm 0.1 · 2026-10-05 · Kaynak: *KVKK - İş Gereksinimleri Version 0.2*

## 1. Teknoloji seçimi

| Katman | Seçim | Neden |
|---|---|---|
| Dil | **TypeScript** (her katmanda) | Web, mobil ve API aynı dil; tipler ve yetki anahtarları tek pakette paylaşılır. |
| API | **NestJS 11** (Node 22) | Modüler yapı, guard/interceptor ile rol tabanlı yetki ve log kolay; büyük ekiplere uygun. |
| Veritabanı | **PostgreSQL 16** | İlişkisel veri (envanter, rol, sözleşme), JSONB ile esnek metadata, tam metin arama (Türkçe), satır seviyesinde kiracı ayrımı. |
| ORM / migration | **Drizzle ORM + drizzle-kit** | Saf TypeScript, ek binary gerektirmez, SQL'e yakın. |
| Web | **Next.js (React)** + responsive arayüz | Gereksinim: tüm fonksiyonlar web'de, mobil tarayıcıda da çalışmalı. |
| Mobil | **React Native (Expo)** — iOS + Android | Tek kod tabanı; App Store / Google Play yıllık abonelik (RevenueCat veya mağaza IAP). |
| Dosya deposu | S3 uyumlu nesne deposu (MinIO / AWS S3) | Doküman sürümleri ve yüklenen dosyalar. |
| Arama | Başlangıçta PostgreSQL full‑text (Türkçe sözlük); ihtiyaç olursa OpenSearch | Gereksinim: arama motoru + metadata. |
| Kuyruk / iş akışı | PostgreSQL tabanlı iş kuyruğu (pg-boss), ileride gerekirse Redis | Alarm, hatırlatma, onay akışları, e‑posta. |
| Altyapı | Docker + Kubernetes (veya yönetilen PaaS), yönetilen PostgreSQL (çok AZ), CDN + WAF | %99,99 erişilebilirlik, DoS koruması, NSPOF, yedekleme. |

Depo yapısı (pnpm monorepo):

```
kvkk/
  apps/api        NestJS API (bu aşamada kuruldu)
  apps/web        Next.js web arayüzü (ilk sürüm kuruldu)
  apps/mobile     Expo mobil uygulama (sonraki adım)
  packages/shared Yetki anahtarları, ortak tipler
  content/        Erdal'ın sağlayacağı KVKK doküman içerikleri (Word/PDF)
  docs/           Mimari ve tasarım dokümanları
```

## 2. Modül sırası (teknik bağımlılığa göre)

1. **Temel (Foundation)** — *bu aşamada kuruldu*
   Kimlik doğrulama (kullanıcı adı/şifre + doğrulama kodu, CAPTCHA, hız sınırı), kuruluşlar (çoklu kuruluş, kuruluş bazında lisans), kullanıcılar, roller ve yetkiler, sistem hareket logu. Diğer tüm modüller buna dayanır.
2. **Kurulum sihirbazı + Kuruluş profili** — firma ünvanı, adres, e‑posta, telefon, KEP (isteğe bağlı), web sitesi (isteğe bağlı), yetkili ad soyad. Bu alanlar doküman şablonlarına otomatik yerleşir.
3. **Doküman Yönetimi (DMS)** — şablonlar, sürümleme, yayınlama, onay akışı, metadata ve arama. Politika, prosedür, talimat, form içerikleri buraya yüklenir.
   *İlk aşama kuruldu (2026-10-08):* şablondan kuruluşa özel doküman üretme, sürümleme, Word ile düzenleyip yükleme, yayınlama. Dosyalar şimdilik PostgreSQL'de (`document_versions.content`) tutuluyor; S3'e taşıma, onay akışı (5. modülle), arama ve doküman ACL'i sonraki adımlar.
4. **Kişisel Veri Envanteri** — VERBİS'teki gibi adım adım seçimli giriş; veri kategorisi, işleme amacı, hukuki sebep, saklama süresi, aktarım, tedbirler; raporlama.
5. **İş akışı, alarm ve onay motoru** — envanter/doküman gözden geçirme, imha periyotları, hatırlatmalar.
   *İlk aşama kuruldu (2026-10-09):* görevler (`tasks`: tür, atanan kişi, son tarih, hatırlatma günleri, tekrarlama, bağlı doküman/envanter satırı), bildirimler (`notifications`, uygulama içi + e‑posta, tekil anahtarla tekrar engeli), doküman sürümü yayın onayı (`approval_requests`; onaylayana görev açılır, onaylanınca sürüm yayınlanır). Alarm taraması şimdilik API içinde zamanlayıcıyla çalışır; pg-boss'a geçiş, SMS/push bildirimleri ve çok adımlı onay zincirleri sonraki adımlar.
   *Web arayüzü ilk sürümü (2026-10-09):* `apps/web` (Next.js 16, App Router). Tarayıcı API'ye doğrudan bağlanmaz; Next.js sunucusu `/api/v1/*` isteklerini API'ye iletir ve oturum belirteçlerini httpOnly çerezlerde tutar (erişim belirteci süresi dolunca `/api/session/refresh` ile yenilenir). Seçili kuruluş tarayıcıda saklanır ve her isteğe `X-Organization-Id` olarak eklenir. Menü ve düğmeler kullanıcının rol yetkilerine göre gösterilir. Ekranlar: giriş/kayıt/şifre, kuruluş oluşturma ve profil, özet (başlangıç adımları), dokümanlar, veri envanteri (TBL-010 sütun gruplarına göre adım adım giriş, Excel içe/dışa aktarma), görevler ve onaylar, bildirimler. Sonraki adımlar: üye/rol yönetimi ekranları, CAPTCHA (Turnstile) bileşeni, logo yükleme, sistem logu ekranı.
6. **Süreç modülleri** — Olay (ihlal) yönetimi, Veri imha yönetimi, Sözleşme yönetimi, Başvuru (ilgili kişi talepleri).
7. **Dashboard ve raporlar** (kişiselleştirilebilir).
8. **Entegrasyonlar** — İleti Yönetim Sistemi (İYS), VERBİS (resmi API olup olmadığı netleşmeli).
9. **Abonelik ve ödeme** — App Store / Google Play yıllık abonelik, web için ödeme sağlayıcı; kuruluş sayısı kadar lisans.
10. **Eğitim** — uzaktan eğitim modülü.
11. **Destek** — ticket ve canlı yardım; kullanıcı kılavuzu.

## 3. Veri modeli (temel modül)

```
users            id, email (benzersiz), full_name, password_hash, is_active,
                 is_platform_admin, failed_login_count, locked_until, created_at
organizations    id, name (ünvan), address, email, phone, kep_address,
                 authorized_person, license_status, license_expires_at, created_at
memberships      user_id + organization_id (benzersiz), role_id, status
roles            id, organization_id (NULL = sistem şablonu), key, name,
                 permissions text[], is_system
login_challenges id, user_id, code_hash, purpose, attempts, expires_at, consumed_at
refresh_tokens   id, user_id, token_hash, expires_at, revoked_at, replaced_by
audit_logs       id, organization_id, user_id, action, entity_type, entity_id,
                 ip, user_agent, metadata jsonb, created_at
```

- **Çoklu kuruluş:** Bir kullanıcı (ör. danışman) birden çok kuruluşa üye olabilir. Her istek `X-Organization-Id` başlığıyla bir kuruluş bağlamında çalışır; tüm iş tabloları `organization_id` taşır. Lisans kuruluş başına tutulur.
- **Yetki:** Yetkiler `modül.eylem` biçiminde anahtarlardır (`users.manage`, `audit.read`, `inventory.write` …) ve `packages/shared` içinde tek listede tanımlıdır. Roller bu anahtarların kümesidir. Menü/fonksiyon yetkisi bu anahtarlarla; içerik bazlı yetki DMS aşamasında doküman ACL'i ile eklenecek. Grup bazlı yetki için `groups` + `group_members` tabloları DMS aşamasında eklenecek.
- **Varsayılan roller:** Kuruluş Yöneticisi (tüm yetkiler), KVKK Sorumlusu, Görüntüleyici. Kuruluşlar kendi rollerini oluşturabilir.

İleriki modüller için öngörülen ana tablolar (henüz kurulmadı): `documents`, `document_versions`, `document_templates`, `inventory_records` (+ kategori/amaç/hukuki sebep sözlükleri), `incidents`, `destruction_records`, `contracts`, `data_subject_requests`, `subscriptions`.

## 4. Güvenlik

- Şifreler `scrypt` ile tuzlanmış hash; şifre politikası en az 10 karakter, harf + rakam (önerilen; netleştirilecek).
- Giriş iki adımlı: şifre doğruysa e‑postaya 6 haneli kod gönderilir (10 dk geçerli, 5 deneme). Sonraki adımda TOTP (Authenticator) seçeneği eklenecek.
- CAPTCHA: Cloudflare Turnstile doğrulaması, ortam değişkeniyle açılır (geliştirmede kapalı).
- Hız sınırı (rate limit) ve 5 hatalı denemede 15 dk hesap kilidi.
- Erişim belirteci (JWT, 15 dk) + dönen yenileme belirteci (veritabanında hash'li, 30 gün).
- Tüm trafik TLS (yalnızca girişte değil, **her yerde**; HSTS). Gereksinimdeki "SSL/TLS nerede?" sorusuna öneri budur.
- Her değiştirici işlem ve tüm giriş olayları `audit_logs` tablosuna yazılır.

## 5. Doküman içerikleri nereye gelecek

Erdal'ın sağlayacağı Word/PDF dosyaları `content/` klasörüne konur. DMS aşamasında bu dosyalar şablona çevrilir ve içlerindeki firma bilgisi alanları yer tutucularla değiştirilir:

`{{kurum.unvan}}`, `{{kurum.adresi}}`, `{{kurum.vergi_no}}`, `{{kurum.web_sitesi_adresi}}`, `{{kurum.eposta}}`, `{{kurum.telefon}}`, `{{kurum.kep}}`, `{{kurum.yetkili}}`

Hukuki metin uydurulmaz; sistem yalnızca sağlanan içeriği kullanır.

## 6. Açık sorular

1. VERBİS'in resmi bir entegrasyon API'si yok gibi görünüyor; entegrasyon "VERBİS'e yüklenecek formatta dışa aktarım" olarak mı düşünülmeli?
2. Doğrulama kodu e‑posta ile mi, SMS ile mi (SMS sağlayıcı maliyeti var), yoksa Authenticator uygulamasıyla mı?
3. Ödeme: web'den satın alma da olacak mı, yoksa yalnızca App Store / Google Play mi?
4. Barındırma: Türkiye'de bir veri merkezi şartı var mı? (KVKK yurt dışı aktarım kuralları nedeniyle önerilir.)
5. Internet Explorer desteği: IE resmi olarak kullanımdan kalktı; desteğin kaldırılmasını öneriyorum.
