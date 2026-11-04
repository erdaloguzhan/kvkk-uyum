# KVK Uyum Yönetim Sistemi — Mimari

Sürüm 0.2 · 2026-11-04 · İlk sürüm 0.1 (2026-10-05) *KVKK - İş Gereksinimleri Version 0.2* belgesine dayanıyordu; bu sürüm sistemin
bugünkü hâlini (main, PR #51 dahil) anlatır.

Canlı ortam: **https://kvkuyum.com.tr** (Türkiye'de bir VPS, Ubuntu 24.04, Docker Compose). Kurulum: [CANLI-KURULUM.md](CANLI-KURULUM.md).

## 1. Teknoloji

| Katman | Kullanılan | Not |
|---|---|---|
| Dil | **TypeScript** (her katmanda) | Yetki anahtarları, kataloglar ve form metinleri `packages/shared` içinde; web ve API aynı listeyi kullanır. |
| API | **NestJS 11** (Node 22) | Guard'larla yetki, kuruluş ve lisans kontrolü; global interceptor ile işlem kaydı. |
| Veritabanı | **PostgreSQL 16**, **Drizzle ORM** | 43 tablo; şema değişiklikleri numaralı migration dosyalarıyla (`apps/api/drizzle`, şu an 0000–0025), API her açılışta eksikleri uygular. |
| Web | **Next.js 16** (React, App Router) | Tüm ekranlar; mobil tarayıcıya uyumlu. Next.js sunucusu tarayıcı ile API arasında aracıdır (BFF). |
| Dosyalar | PostgreSQL `bytea` sütunları | Doküman sürümleri, şablonlar, eğitim görselleri, imzalar, logolar, destek ve başvuru ekleri. S3'e taşıma gerekirse sonra. |
| Zamanlanmış işler | API içinde zamanlayıcı (`ALARM_INTERVAL_MINUTES`, varsayılan 60) | Görev, sözleşme, ihlal, başvuru ve imha alarmları; tekil anahtar sayesinde birden çok kopya aynı bildirimi iki kez yazmaz. |
| E-posta | SMTP (canlıda `info@kvkuyum.com.tr`, yerelde Mailpit) | Tüm e-postalar düz metin + HTML; "Sayın Ad Soyad," hitabıyla başlar. |
| SMS | **Verimor** (başlık `SMS_HEADER`, canlıda `Bi ARTI`) | Panel giriş kodu, şifre sıfırlama kodu, Eğitim Portalı giriş kodu, eğitim/doküman bildirimleri. |
| CAPTCHA | Sunucunun kendi iş kanıtı (proof-of-work, ALTCHA biçimi) | Dış servise veri gitmez (Cloudflare Turnstile IP'yi yurt dışına gönderdiği için kullanılmaz, karar 2026-11-01). |
| Altyapı | Docker Compose: caddy (HTTPS), web, api, postgres, backup, offsite | Tek sunucu; ayrıntı [CANLI-KURULUM.md](CANLI-KURULUM.md), yedek [FELAKET-KURTARMA.md](FELAKET-KURTARMA.md). |
| Mobil | Yok | Erdal'ın kararı (2026-10-26): şimdilik mobil uygulama yapılmıyor; web mobil tarayıcıda çalışır. |

Depo yapısı (pnpm monorepo):

```
kvkk-uyum/
  apps/api        NestJS API
  apps/web        Next.js web arayüzü (müşteri paneli, yönetim paneli, Eğitim Portalı, başvuru formu)
  packages/shared Yetki anahtarları, sabit roller, kataloglar, form metinleri
  content/        Erdal'ın sağladığı KVKK doküman şablonları (Word)
  deploy/         Caddy, yedek ve sunucu dışı yedek betikleri, örnek .env dosyaları
  docs/           Bu ve diğer teknik belgeler
```

## 2. Arayüzler

| Arayüz | Adres | Kim kullanır |
|---|---|---|
| Müşteri paneli | `/` (giriş `/giris`) | Kuruluşun KVKK Sorumlusu ve Yöneticisi |
| Yönetim paneli | `/admin` | Bi Artı'nın platform yöneticileri ve eğitimcileri |
| Eğitim Portalı | `/egitim` | Kuruluş çalışanları (şifresiz: cep telefonu + SMS kodu) |
| İlgili kişi başvuru formu | `/basvuru/<kod>` | Herkes (kuruluşun web sitesine bağlantı veya `iframe` olarak konur) |
| Rol seçimi | `/rol-sec` | Birden çok rolü olan hesap girişten sonra rolünü seçer |

## 3. Modüller ve durumları

| Modül | API klasörü | Ekran | Durum |
|---|---|---|---|
| Kimlik doğrulama: şifre + SMS kodu (telefon yoksa veya SMS gitmezse e-posta kodu), CAPTCHA, kilit, davet, şifre sıfırlama (e-posta bağlantısı + SMS kodu), oturum iptali | `auth` | `/giris`, `/sifre-belirle`, `/sifremi-unuttum`, `/profil` | Canlıda |
| Kuruluşlar, üyelikler, sabit roller, logo | `organizations`, `members`, `roles` | `/kurulus` | Canlıda |
| Yönetim paneli: kuruluş açma, kullanıcılar, lisans, veri dışa aktarma ve silme | `admin` | `/admin`, `/admin/kuruluslar/[id]` | Canlıda |
| Şablon sürümleri (KVK dokümanları ve envanter seçenek listeleri) | `templates`, `inventory` | `/admin/sablonlar`, `/admin/envanter-sablonu` | Canlıda |
| Doküman yönetimi | `documents` | `/dokumanlar` | Canlıda |
| Kişisel veri envanteri (TBL-010) ve envanter onayı | `inventory` | `/envanter` | Canlıda |
| KVK sözleşmeleri | `contracts` | `/sozlesmeler` | Canlıda |
| Kişisel veri imha yönetimi | `destruction` | `/imha`, `/imha/sorumlular`, `/imha/kayitlar` | Canlıda |
| Veri ihlali olay yönetimi (FRM-020) | `incidents` | `/ihlaller` | Canlıda |
| İlgili kişi başvuruları (FRM-010) | `requests` | `/basvurular`, `/basvuru/<kod>` | Canlıda |
| İş akışı, görevler, alarmlar, bildirimler | `workflow` | `/gorevler`, `/bildirimler` | Canlıda |
| İşlem kayıtları | `audit` | `/kayitlar` | Canlıda |
| Uzaktan eğitim, sertifika, Eğitim Portalı, doküman okuma onayı | `training` | `/admin/egitim`, `/egitim` | Canlıda ([EGITIM.md](EGITIM.md)) |
| Destek talepleri | `support` | `/destek`, `/admin/destek` | Canlıda ([DESTEK.md](DESTEK.md)) |
| Hata uyarıları (500, alarm hatası, disk) | `monitoring` | E-posta | Canlıda ([IZLEME.md](IZLEME.md)) |
| Dashboard ve raporlar (kişiselleştirilebilir) | — | — | Yapılmadı (ihlal ve başvuruda modül raporları var) |
| İYS / VERBİS entegrasyonu | — | — | Yapılmadı |
| Online ödeme | — | — | Yapılmadı: satın alma biartidanismanlik.com'dan, lisans yönetim panelinden elle verilir |
| Mobil uygulama | — | — | Şimdilik yapılmıyor |

### Modüllerin ana kuralları

- **Dokümanlar:** Şablon kuruluş bilgileriyle (`{{kurum.unvan}}` vb.) doldurulur, sürüm 1 taslak olarak kaydedilir; Word'de düzenlenip yeni
  sürüm olarak yüklenebilir. Sorumlu sürümü Yöneticinin onayına gönderir, onaylanan sürüm yayına girer. Yayın tarihi ve revizyon no
  sistem tarafından doldurulmaz. "Çalışanlar görebilsin" işaretli yayındaki dokümanlar Eğitim Portalında görünür.
- **Envanter:** TBL-010'un 16 sütunu; seçenek listeleri yönetim panelindeki şablondan gelir (değişiklik yalnızca sonradan açılan satırlara
  yansır). Değişiklikler hemen yazılır; Sorumlu son onaydan bu yana eklenen, değişen, silinen satırları Yöneticiye gönderir
  (`inventory_approvals`).
- **İmha:** Periyot kuruluş ayarıdır (`organizations.destruction_period_months`, POL-020'ye göre varsayılan 6 ay). İmha sorumlusu tablosu
  dönem geçmişini tutar (yeni sorumlu atanınca eskisi kapanır, silinmez). İmha planı kalemleri envanter satırlarından üretilir
  (saklama süresi ve ortam kopyalanır; işlem türü silme / yok etme / anonimleştirme). Plan Yöneticinin onayına gider; kalem
  "yapıldı" işaretlenince imha işlem kaydı otomatik oluşur, plansız kayıt elle de eklenebilir. Hatırlatma 7 ve 1 gün kala.
- **Veri ihlali:** Olay kaydı Kurul'un FRM-020 formunun güncel hâlindeki (2026-11-03) A–D bölümleri, 31 soru ve EK-1 ile tutulur.
  Akış: taslak → onayda → onaylandı → Kurul'a bildirildi veya kapatıldı (gerekçeli); ret taslağa döner. Düzenleme ve silme yalnızca
  taslakta. 72 saatlik süre olayın öğrenildiği andan sayılır; oluşturulunca, 24 saatten az kalınca ve süre geçince her gün (30 gün)
  alarm gider. Form Word (FRM-020 düzeninde) olarak indirilir; takip bildirimi formu kopyalayarak açılır.
- **İlgili kişi başvuruları:** Ayrıntı [BASVURU.md](BASVURU.md). Kurum içi hedef 20 gün (görev son tarihi), yasal süre 30 gün (md. 13).
- **İş akışı:** Görevler (tür, atanan, son tarih, hatırlatma günleri, tekrar 1/3/6/12 ay), bildirimler (uygulama içi + e-posta),
  onay talepleri. Yönetim paneli de eğitimcilere görev atar (`organization_id` boş görev ve bildirimler).
- **Lisans:** Kuruluş açılınca `TRIAL_DAYS` (varsayılan 30) gün deneme başlar; lisans bitişi yönetim panelinden girilir. Süresi dolan
  kuruluş **salt okunur** olur (Erdal, 2026-10-29): giriş, görüntüleme ve indirme serbest; ekleme ve değiştirme kapalı (bildirimi okundu
  yapmak ve destek talebi açmak serbest). Eğitim Portalı ve başvuru formu etkilenmez.
- **Kuruluş verisinin silinmesi:** Abonelik bitişinden 15 gün sonra listede "Silinmeli" etiketi çıkar. Yönetim paneli önce kuruluşun
  bütün verisini tek ZIP olarak dışa aktarabilir, sonra lisansı bitmiş kuruluşu adını birebir yazarak siler (kuruluş, işlem kayıtları,
  portal kodları ve başka üyeliği olmayan kullanıcılar). Silme elle yapılır; yedekler en fazla 14 gün tutulur.

## 4. Roller ve menüler

Müşteri kuruluşlarda yalnızca üç sabit rol vardır (Erdal, 2026-10-19); özel rol yoktur ve müşteri kullanıcı ekleyemez. Hesaplar yönetim
panelinden açılır, kişiye şifre oluşturma bağlantısı gider. Kuruluşta her zaman en az bir aktif Sorumlu ve bir aktif Yönetici yetkisi kalır.

| Rol | Yapabildikleri |
|---|---|
| **KVKK Sorumlusu** (`kvkk_officer`) | Tüm işi yapar; doküman, envanter, imha planı ve ihlal formunu Yöneticinin onayına gönderir. Onaylayamaz, yayınlayamaz. |
| **Yönetici** (`approver`) | Okur, onaylar veya gerekçeyle reddeder, rapor alır, görev atar; ihlali "Kurul'a bildirildi / bildirim gerekmedi" olarak işaretler. Kayıt değiştiremez. |
| **KVKK Sorumlusu + Yönetici** (`officer_approver`) | Aynı kişi (aynı e-posta) ikisini birden üstlenir; küçük kuruluşlar için. |
| **Platform yöneticisi** | Bi Artı'nın KVK Uyum yöneticisi (`PLATFORM_ADMIN_EMAILS`); yalnızca `/admin` adresinden girer, rol seçiminde görünmez. |
| **Eğitmen** | Bi Artı'nın eğitim personeli: eğitimler, eğitim grupları, kendisine atanan görevler ve bildirimler. |
| **Çalışan** | Ayrı hesap yok; Eğitim Portalında yayınlanmış dokümanları okur, eğitimlerini alır. |

- **Birden çok rol (2026-10-25):** Bir hesap birden çok kuruluş rolüne ve Eğitmen rolüne sahip olabilir. Girişten sonra `/rol-sec`
  ekranında rol seçilir; seçim yalnızca arayüzü belirler (tarayıcıda `kvkk_rol`), yetkiyi her istekte sunucu denetler.
- **Menüler (2026-10-28, Erdal'ın çizimi):** Başlık "KVK Uyum Yönetim Sistemi" + "<Rol> Paneli". Kuruluş panellerinde kuruluşun logosu
  (yüklenmişse) yoksa adı; yönetim paneli, Eğitmen ve Eğitim Portalında Bi Artı logosu.
  - Sorumlu: Özet, Kuruluş Bilgileri, KVK Dokümanları, Kişisel Veri Envanteri | KVK Sözleşmeleri, Kişisel Veri İmha Yönetimi |
    Veri İhlalleri, İlgili Kişi Başvuruları | Görevler, Bildirimler, İşlem Kayıtları. Destek ve rol değiştirme Profilim sayfasındadır.
  - Yönetici: aynı, Sözleşmeler olmadan; imha ihlal/başvuru grubunun altında.
  - Yönetim paneli: Kuruluşlar, KVK Dokümanları (şablon), Kişisel Veri Envanteri (şablon) | Eğitimler, Eğitim Grupları, Eğitimciler |
    Destek Talepleri.
  - Eğitmen: Eğitimler, Eğitim Grupları | Görevler | Bildirimler.
  - Eğitim Portalı: Özet, KVK Dokümanları, Eğitimlerim, Profil.

## 5. Veri modeli

43 tablo. Kuruluş (`organizations`) merkezdir: iş tabloları `organization_id` ile bağlanır ve kuruluş silinince birlikte silinir.
Şemanın kaynağı `apps/api/src/db/schema.ts` ve modül klasörlerindeki `*.schema.ts` dosyalarıdır.

| Grup | Tablolar |
|---|---|
| Hesap ve oturum | `users` (telefon, `sessions_revoked_at`), `login_challenges`, `refresh_tokens`, `password_reset_tokens`, `password_reset_codes`, `portal_login_codes` |
| Kuruluş ve yetki | `organizations` (profil, logo, lisans, başvuru formu anahtarı, imha periyodu), `memberships`, `roles` |
| Dokümanlar | `document_templates`, `template_versions`, `documents`, `document_versions`, `document_reads` |
| Envanter | `inventory_entries`, `inventory_approvals`, `inventory_template_options` |
| Süreçler | `contracts`, `incidents`, `data_subject_requests`, `data_subject_request_events`, `data_subject_request_files`, `destruction_officers`, `destruction_plans`, `destruction_items`, `destruction_records` |
| İş akışı | `tasks`, `approval_requests`, `notifications` |
| Eğitim | `employees`, `trainers` (unvan, imza), `trainings`, `training_topics`, `training_media`, `training_questions`, `training_groups` (eğitimci), `training_participants`, `training_exam_attempts`, `training_exam_answers` |
| Destek | `support_tickets`, `support_messages`, `support_attachments` |
| Kayıt | `audit_logs` |

## 6. Güvenlik

- **Şifre:** tuzlanmış `scrypt`; en az 10 karakter, harf + rakam. Bilinmeyen e-postada da sahte hesaplama yapılır (süre farkı sızdırmaz).
- **Panel girişi iki adımlı:** şifre doğruysa 6 haneli kod hesabın cep telefonuna SMS ile gider (10 dk, 5 deneme); telefon yoksa veya
  SMS gönderilemezse e-postaya gider. Cihaz hatırlama yoktur (Erdal, 2026-10-26).
- **Şifremi unuttum:** e-postaya 1 saatlik bağlantı; telefon kayıtlıysa ayrıca SMS ile 10 dakikalık kod (10 dakikada 3, günde 10 SMS sınırı).
- **Eğitim Portalı şifresizdir:** cep telefonu + 5 dakika geçerli SMS kodu (10 dakikada 3, günde 10 kod); portal oturumu 4 saat.
- **CAPTCHA:** giriş, şifre sıfırlama, portal ve başvuru formunda sunucunun kendi iş kanıtı (tek kullanımlık, 5 dakika).
- **Kilit ve hız sınırı:** 5 hatalı denemede 15 dakika hesap kilidi; giriş ve kod uç noktalarında hız sınırı.
- **Belirteçler:** erişim belirteci (JWT) 15 dakika, dönen yenileme belirteci 30 gün (veritabanında özet). Şifre değişince veya
  sıfırlanınca `sessions_revoked_at` ile o andan önceki tüm oturumlar düşer. Belirteçler httpOnly, SameSite=Strict, Secure çerezlerde.
- **Kuruluş ayrımı ve yetki:** her istek `X-Organization-Id` taşır; sunucu aktif üyeliği ve `modül.eylem` yetki anahtarını her istekte denetler.
- **T.C. kimlik no:** veritabanında `DATA_ENCRYPTION_KEY` ile alan düzeyinde şifreli.
- **İşlem kayıtları:** giriş olayları, veri değiştiren her istek ve dosya indirmeleri kim, ne zaman, IP ve tarayıcıyla `audit_logs`'a yazılır;
  istek gövdesi yazılmaz.
- **Dosyalar:** tür ilk baytlardan kontrol edilir; `.xlsx`/`.docx` yüklemelerinde ZIP bombası denetimi (100 MB).
- **HTTP:** her yerde TLS + HSTS (Caddy), CSP ve güvenlik başlıkları; yalnızca `/basvuru/*` başka sitelerde çerçevede açılabilir.
- **Barındırma:** sunucu Türkiye'de. Yedekler GPG ile şifrelenip yöneticinin bilgisayarına çekilir; tüm yedekler en fazla 14 gün.

## 7. Doküman içerikleri

Erdal'ın sağladığı Word dosyaları `content/` klasöründedir; ilk açılışta v1 şablon olarak veritabanına alınır, sonraki sürümler yönetim
panelinden yüklenir. Yer tutucular: `{{kurum.unvan}}`, `{{kurum.adresi}}`, `{{kurum.vergi_no}}`, `{{kurum.web_sitesi_adresi}}`,
`{{kurum.eposta}}`, `{{kurum.telefon}}`, `{{kurum.kep}}`, `{{kurum.yetkili}}`. KEP ve web sitesi isteğe bağlıdır
(boş kalır); `{{kurum.logo}}` henüz desteklenmez ve boş bırakılır (panelde yüklenen logo yalnızca arayüzde görünür). Hukuki metin uydurulmaz; sistem yalnızca sağlanan içeriği kullanır.

## 8. Açık konular

| Konu | Durum |
|---|---|
| Doğrulama kodu kanalı | Kapandı: SMS (Verimor), yedek e-posta. |
| Barındırma yeri | Kapandı: Türkiye'de VPS. |
| Internet Explorer | Desteklenmiyor. |
| VERBİS entegrasyonu | Açık: resmi API yok; VERBİS'e uygun dışa aktarım olarak düşünülebilir. |
| Online ödeme | Açık: şimdilik web sitesinden satın alma + elle lisans. |
| Saklama süreleri ile 1 aylık silme | Açık: Bi Artı'nın kendi işlem kayıtlarının (5 yıl) ve hesap bilgilerinin (10 yıl) müşteri silindikten sonra ayrıca saklanıp saklanmayacağı kararı bekleniyor; bugün silme her şeyi siler. |
