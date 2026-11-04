# KVK Yönetim Sistemi

KVKK uyum yönetimi için web, iOS ve Android uygulaması. Mimari ve modül sırası: [docs/MIMARI.md](docs/MIMARI.md).

## Durum

Sistem **https://kvkuyum.com.tr** adresinde canlıdır. Modüllerin listesi, roller, menüler ve güvenlik: [docs/MIMARI.md](docs/MIMARI.md).

| Bileşen | Durum |
|---|---|
| `apps/api` — Kimlik doğrulama (şifre + SMS kodu, yedek e-posta kodu), CAPTCHA (iş kanıtı), kilit, davet, şifre sıfırlama (bağlantı + SMS kodu), kuruluşlar, sabit roller, lisans (süre dolunca salt okunur), işlem kayıtları | Canlıda, testli |
| `apps/api` — Dokümanlar, kişisel veri envanteri ve onayı, sözleşmeler, imha yönetimi, veri ihlali (FRM-020), ilgili kişi başvuruları (FRM-010), görevler ve alarmlar, bildirimler | Canlıda, testli |
| `apps/api` — Uzaktan eğitim ve sertifika, Eğitim Portalı (cep telefonu + SMS kodu), doküman okuma onayı, destek talepleri | Canlıda, testli |
| `apps/api` — Yönetim paneli: kuruluş ve kullanıcı açma, lisans, şablon sürümleri, envanter seçenek şablonu, kuruluş verisini ZIP olarak dışa aktarma ve silme, eğitimci görevleri | Canlıda, testli |
| `packages/shared` — Yetki anahtarları, sabit roller, kataloglar, form metinleri | Hazır |
| `apps/web` — Müşteri paneli, yönetim paneli, Eğitim Portalı, başvuru formu, rol seçimi; mobil tarayıcıya uyumlu | Canlıda |
| Mobil uygulama (iOS/Android) | Şimdilik yapılmıyor (2026-10-26) |

## Çalıştırma

**En kolay yol (programlama bilgisi gerekmez):** [docs/YEREL-KURULUM.md](docs/YEREL-KURULUM.md). Docker Desktop kuruluysa depo klasöründe `docker compose up --build` her şeyi başlatır: web arayüzü http://localhost:3000, gelen e-postalar http://localhost:8025, SMS kodları `docker compose logs api` çıktısında.

**Canlı ortam (gerçek kullanıcılar):** [docs/CANLI-KURULUM.md](docs/CANLI-KURULUM.md). `docker-compose.prod.yml` HTTPS (Caddy), kapalı veritabanı portu ve günlük yedekle çalışır; ayarlar `deploy/.env.prod.example` içindedir.

### Geliştirme

Gerekenler: Node 22, pnpm 10, PostgreSQL 16 (veya `docker compose up -d postgres`).

```bash
pnpm install
pnpm --filter @kvkk/shared build
cd apps/api
cp .env.example .env            # değerleri düzenleyin
export $(grep -v '^#' .env | xargs)
pnpm build && pnpm db:migrate
pnpm start                      # http://localhost:3000/api/v1/health
```

`SMTP_URL` boşsa e-postalar (giriş kodu, davet) gönderilmez, API loguna yazılır. `VERIMOR_USERNAME`/`VERIMOR_PASSWORD` boşsa SMS'ler (giriş kodları, Eğitim Portalı kodu) geliştirmede API loguna yazılır; canlıda (`NODE_ENV=production`) panel kodu e-postayla gider, Eğitim Portalına girilemez.

Web arayüzü (API çalışırken, ayrı bir terminalde):

```bash
cd apps/web
API_URL=http://localhost:3000 pnpm dev   # http://localhost:3001
```

Web sunucusu tarayıcı ile API arasında aracıdır: tarayıcı yalnızca web sunucusuna (`/api/v1/...`) istek atar, web sunucusu bunu `API_URL`'deki API'ye iletir. Oturum belirteçleri tarayıcıda JavaScript'in okuyamadığı (httpOnly, SameSite=Strict) çerezlerde tutulur; bu yüzden API'de CORS açmak gerekmez.

Testler gerçek PostgreSQL üzerinde çalışır (varsayılan `postgres://postgres@localhost:5433/kvkk_test`, `TEST_DATABASE_URL` ile değiştirilebilir; şema her çalıştırmada sıfırlanır):

```bash
cd apps/api && pnpm test
```

## API özeti (`/api/v1`)

Kuruluş bağlamındaki uç noktalar `X-Organization-Id` başlığı ister. Lisansı dolmuş kuruluşta değiştirici istekler 403 döner (salt okunur). Eğitim, destek ve diğer ayrıntılar: [docs/EGITIM.md](docs/EGITIM.md), [docs/DESTEK.md](docs/DESTEK.md), [docs/BASVURU.md](docs/BASVURU.md).

| Uç nokta | Yetki |
|---|---|
| `GET /auth/captcha`, `POST /auth/login` (kod SMS'le, yoksa e-postayla gider), `/auth/verify`, `/auth/refresh` | Herkese açık |
| `POST /auth/password-reset/request`, `/auth/password-reset/confirm` (bağlantı), `/auth/password-reset/confirm-code` (SMS kodu), `/auth/password-reset/info` | Herkese açık |
| `POST /auth/change-password`, `PATCH /auth/me/phone` (giriş kodunun gideceği cep telefonu) | Giriş yapmış |
| `GET /auth/me`, `POST /auth/logout`, `GET /permissions` | Giriş yapmış |
| `GET /organizations/current` | `org.read` |
| `PATCH /organizations/current`, `POST /organizations/current/complete-setup` | `org.manage` |
| `GET /members`, `GET /roles` | `users.read` |
| `GET /audit-logs` (`?module=`, `?userId=`, `?from=&to=` gün, `?before=` sayfalama) | `audit.read` |
| `GET /document-templates`, `GET /documents`, `GET /documents/:id`, `GET /documents/:id/versions/:versionId/file` | `documents.read` (taslakları yalnızca `documents.write` veya `documents.approve` sahipleri görür); `PATCH /documents/:id` (`employeeVisible`: çalışanlara portalda gösterilsin mi) `documents.write` |
| `POST /documents` (şablondan), `POST /documents/setup` (opsiyonel olmayan tüm şablonlar), `POST /documents/:id/regenerate`, `POST /documents/:id/versions` (`.docx` yükleme) | `documents.write` |
| `POST /documents/:id/versions/:versionId/publish` | `documents.approve` |
| `GET /inventory`, `GET /inventory/:id`, `GET /inventory/options`, `GET /inventory/summary`, `GET /inventory/export` (TBL-010 Excel) | `inventory.read` |
| `POST /inventory`, `PATCH /inventory/:id`, `POST /inventory/:id/duplicate`, `DELETE /inventory/:id`, `POST /inventory/import` (TBL-010 Excel; `?dryRun=true` kontrol, `?mode=replace` değiştirme) | `inventory.write` |
| `GET /inventory/approval` (son onay, bekleyen talep, onaysız değişiklikler), `GET /inventory/approval-requests`, `GET /inventory/approval-requests/:id` | `inventory.read` |
| `POST /inventory/approval-requests` (değişiklikleri onaya gönderir), `POST /inventory/approval-requests/:id/cancel` | `inventory.write` |
| `POST /inventory/approval-requests/:id/approve`, `POST /inventory/approval-requests/:id/reject` (gerekçe zorunlu) | `inventory.approve` + seçilen onaylayıcı |
| `GET /documents/:id/reads` (çalışanların "Okudum, anladım." onayları ve onaylamayanlar) | `documents.read` |
| `GET /training-portal/documents/:id` (okumak için HTML), `POST /training-portal/documents/:id/read` (`versionId`; okuma onayı) | Eğitim portalı oturumu |
| `GET /tasks` (`?mine=true`, `?overdue=true`, `?status=`, `?entityType=&entityId=`), `GET /tasks/:id`, `GET /tasks/options`, `POST /tasks/:id/complete` | Kuruluş üyesi (`tasks.read` yoksa yalnızca kendisine atananlar) |
| `GET /tasks/summary` | `tasks.read` |
| `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/cancel` | `tasks.manage` |
| `POST /documents/:id/versions/:versionId/approval-requests`, `POST /approval-requests/:id/cancel` | `documents.write` |
| `GET /approval-requests`, `GET /approval-requests/:id` | Kuruluş üyesi (doküman yetkisi yoksa yalnızca kendi talepleri / onaylayacakları) |
| `POST /approval-requests/:id/approve` (sürümü yayınlar), `POST /approval-requests/:id/reject` (gerekçe zorunlu) | `documents.approve` + seçilen onaylayıcı |
| `GET /notifications` (`?unread=true`), `POST /notifications/:id/read`, `POST /notifications/read-all` | Kuruluş üyesi (kendi bildirimleri) |
| `GET /contracts`, `GET /contracts/:id` / `POST /contracts`, `PATCH`/`DELETE /contracts/:id` | `contracts.read` / `contracts.manage` |
| `GET /incidents`, `GET /incidents/report`, `GET /incidents/:id`, `GET /incidents/:id/form.docx` (FRM-020 Word) | `incidents.read` |
| `POST /incidents`, `PATCH`/`DELETE /incidents/:id` (yalnızca taslak), `POST /incidents/:id/submit`, `/withdraw`, `/follow-up` | `incidents.manage` |
| `POST /incidents/:id/approve`, `/reject` (gerekçe zorunlu) | `incidents.approve` |
| `POST /incidents/:id/notified` (Kurul'a bildirildi), `/close` (bildirim gerekmedi, gerekçe) | `incidents.read` + onaylanmış olay |
| `GET/POST /request-form/:kod` (herkese açık FRM-010 formu; CAPTCHA, hız sınırı) | Herkese açık |
| `GET /data-subject-requests`, `/report`, `/form-settings`, `/:id`, `/:id/pdf`, `/:id/files/:fileId` | `requests.read` |
| `POST /data-subject-requests` (elden gelen başvuru), `PATCH /form-settings`, `POST /form-settings/regenerate`, `POST /:id/status`, `/assignee`, `/notes`, `/files`, `/answer` | `requests.manage` |
| `GET /destruction/settings`, `/officers`, `/plans`, `/plans/:id`, `/items/:id`, `/records` | `destruction.read` |
| `PUT /destruction/settings`, `POST/PATCH /destruction/officers`, `POST/PATCH/DELETE /destruction/plans...`, `POST /plans/:id/items/from-inventory`, `/submit`, `/withdraw`, `/next`, `POST /items/:id/complete`, `/cancel`, `POST/PATCH/DELETE /destruction/records...` | `destruction.manage` |
| `POST /destruction/plans/:id/approve`, `/reject` | `destruction.approve` |
| `POST /training-portal/login/code` (telefona SMS kodu), `POST /training-portal/login` | Herkese açık (CAPTCHA) |
| `PATCH /admin/organizations/:id/license`, `GET /admin/organizations/:id/export` (tüm veri ZIP), `DELETE /admin/organizations/:id` (lisansı bitmiş, ad onayıyla), `PATCH /admin/users/:userId/phone` | Platform yöneticisi |
| `GET/POST /admin/organizations` (kuruluşu Sorumlu ve Yönetici hesaplarıyla açar; her birine şifre oluşturma bağlantısı gider), `POST /admin/organizations/:id/resend-invite` | Platform yöneticisi |
| `GET/POST /admin/organizations/:id/members`, `PATCH/DELETE /admin/organizations/:id/members/:memberId`, `POST /admin/organizations/:id/members/:memberId/resend-invite` (kuruluş kullanıcıları; müşteri kullanıcı ekleyemez) | Platform yöneticisi |
| `GET/POST /admin/templates`, `GET/PATCH /admin/templates/:code`, `POST /admin/templates/:code/versions` (`.docx`, taslak), `POST .../versions/:id/publish` (`effectiveDate`), `POST .../versions/:id/unpublish`, `DELETE .../versions/:id`, `GET .../versions/:id/file` | Platform yöneticisi |

Platform yöneticileri `PLATFORM_ADMIN_EMAILS` ile tanımlanır (açılışta bu adreslerdeki hesaplar yönetici yapılır, hesap yoksa açılıp şifre oluşturma bağlantısı gönderilir). Ana doküman şablonları ilk açılışta `content/` klasöründen v1 olarak veritabanına alınır; sonraki sürümleri yönetim panelinden yüklenir. Yayınlanan sürüm yayın tarihinden itibaren yeni dokümanlarda kullanılır; kuruluşların mevcut dokümanları değişmez, `templateUpdate` alanıyla "güncelleme mevcut" gösterilir.

Alarmlar API içinde `ALARM_INTERVAL_MINUTES` (varsayılan 60) dakikada bir taranır: son tarihe hatırlatma günü kadar kala (varsayılan 7 ve 1 gün), son gün ve süre geçince (atanana ilk gün ve sonra haftada bir, görevi açana bir kez). Aynı alarm iki kez gönderilmez; birden çok sunucu çalışsa da tek kayıt oluşur.
