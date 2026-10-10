# KVK Yönetim Sistemi

KVKK uyum yönetimi için web, iOS ve Android uygulaması. Mimari ve modül sırası: [docs/MIMARI.md](docs/MIMARI.md).

## Durum

| Bileşen | Durum |
|---|---|
| `apps/api` — Temel modül: giriş (şifre + e-posta kodu), CAPTCHA, hız sınırı, hesap kilidi, şifre sıfırlama/davet, kuruluşlar, üyeler, roller/yetkiler, sistem logu | Hazır, testli |
| `apps/api` — Doküman Yönetimi: şablonları kuruluş bilgileriyle doldurma, sürümleme, Word ile düzenleyip yükleme, yayınlama | Hazır, testli |
| `apps/api` — Kişisel Veri Envanteri: TBL-010'un 16 sütunuyla envanter satırları, öneri listeleri, eksik alan takibi, özet, TBL-010 biçiminde Excel çıktısı ve Excel'den içe aktarma | Hazır, testli |
| `apps/api` — İş akışı ve alarmlar: görev atama, son tarih, tekrarlayan görevler, hatırlatma/gecikme alarmları (uygulama içi + e-posta), doküman yayın onayı | Hazır, testli |
| `apps/api` — Sözleşmeler: karşı taraf, tür (tedarikçi, müşteri, çalışan, kamu kurumu), başlangıç/bitiş, statü, ilgili kişi, açıklama | Hazır, testli |
| `packages/shared` — Yetki anahtarları, varsayılan roller, doküman yer tutucuları, şablon kataloğu, envanter sütunları, görev türleri | Hazır |
| `apps/web` — Web arayüzü (Next.js): giriş (şifre + e-posta kodu), kayıt, şifre sıfırlama/davet, kuruluş oluşturma ve profil, özet, dokümanlar (oluşturma, indirme, Word yükleme, yayınlama, onay), veri envanteri (adım adım giriş, Excel içe/dışa aktarma), sözleşmeler, görevler, bildirimler; mobil tarayıcıya uyumlu | İlk sürüm |
| `apps/mobile` (Expo) | Sırada |

## Çalıştırma

**En kolay yol (programlama bilgisi gerekmez):** [docs/YEREL-KURULUM.md](docs/YEREL-KURULUM.md). Docker Desktop kuruluysa depo klasöründe `docker compose up --build` her şeyi başlatır: web arayüzü http://localhost:3000, gelen e-postalar (giriş kodları) http://localhost:8025.

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

`SMTP_URL` boşsa e-postalar (giriş kodu, davet) gönderilmez, API loguna yazılır.

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

Kuruluş bağlamındaki uç noktalar `X-Organization-Id` başlığı ister.

| Uç nokta | Yetki |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/verify`, `/auth/refresh` | Herkese açık |
| `POST /auth/password-reset/request`, `/auth/password-reset/confirm` | Herkese açık |
| `GET /auth/me`, `POST /auth/logout`, `GET /permissions` | Giriş yapmış |
| `GET /organizations/current` | `org.read` |
| `PATCH /organizations/current`, `POST /organizations/current/complete-setup` | `org.manage` |
| `GET /members`, `GET /roles` | `users.read` |
| `POST/PATCH/DELETE /members` | `users.manage` |
| `POST/PATCH/DELETE /roles` | `roles.manage` |
| `GET /audit-logs` | `audit.read` |
| `GET /document-templates`, `GET /documents`, `GET /documents/:id`, `GET /documents/:id/versions/:versionId/file` | `documents.read` (taslakları yalnızca `documents.write` sahipleri görür) |
| `POST /documents` (şablondan), `POST /documents/setup` (opsiyonel olmayan tüm şablonlar), `POST /documents/:id/regenerate`, `POST /documents/:id/versions` (`.docx` yükleme) | `documents.write` |
| `POST /documents/:id/versions/:versionId/publish` | `documents.approve` |
| `GET /inventory`, `GET /inventory/:id`, `GET /inventory/options`, `GET /inventory/summary`, `GET /inventory/export` (TBL-010 Excel) | `inventory.read` |
| `POST /inventory`, `PATCH /inventory/:id`, `POST /inventory/:id/duplicate`, `DELETE /inventory/:id`, `POST /inventory/import` (TBL-010 Excel; `?dryRun=true` kontrol, `?mode=replace` değiştirme) | `inventory.write` |
| `GET /tasks` (`?mine=true`, `?overdue=true`, `?status=`, `?entityType=&entityId=`), `GET /tasks/:id`, `GET /tasks/options`, `POST /tasks/:id/complete` | Kuruluş üyesi (`tasks.read` yoksa yalnızca kendisine atananlar) |
| `GET /tasks/summary` | `tasks.read` |
| `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/cancel` | `tasks.manage` |
| `POST /documents/:id/versions/:versionId/approval-requests`, `POST /approval-requests/:id/cancel` | `documents.write` |
| `GET /approval-requests`, `GET /approval-requests/:id` | Kuruluş üyesi (doküman yetkisi yoksa yalnızca kendi talepleri / onaylayacakları) |
| `POST /approval-requests/:id/approve` (sürümü yayınlar), `POST /approval-requests/:id/reject` (gerekçe zorunlu) | `documents.approve` + seçilen onaylayıcı |
| `GET /notifications` (`?unread=true`), `POST /notifications/:id/read`, `POST /notifications/read-all` | Kuruluş üyesi (kendi bildirimleri) |
| `GET/POST /admin/organizations` (kuruluş açar, kayıttaki e-postaya şifre oluşturma bağlantısı gönderir), `POST /admin/organizations/:id/resend-invite` | Platform yöneticisi |
| `GET/POST /admin/templates`, `GET/PATCH /admin/templates/:code`, `POST /admin/templates/:code/versions` (`.docx`, taslak), `POST .../versions/:id/publish` (`effectiveDate`), `POST .../versions/:id/unpublish`, `DELETE .../versions/:id`, `GET .../versions/:id/file` | Platform yöneticisi |

Platform yöneticileri `PLATFORM_ADMIN_EMAILS` ile tanımlanır (açılışta bu adreslerdeki hesaplar yönetici yapılır, hesap yoksa açılıp şifre oluşturma bağlantısı gönderilir). Ana doküman şablonları ilk açılışta `content/` klasöründen v1 olarak veritabanına alınır; sonraki sürümleri yönetim panelinden yüklenir. Yayınlanan sürüm yayın tarihinden itibaren yeni dokümanlarda kullanılır; kuruluşların mevcut dokümanları değişmez, `templateUpdate` alanıyla "güncelleme mevcut" gösterilir.

Alarmlar API içinde `ALARM_INTERVAL_MINUTES` (varsayılan 60) dakikada bir taranır: son tarihe hatırlatma günü kadar kala (varsayılan 7 ve 1 gün), son gün ve süre geçince (atanana ilk gün ve sonra haftada bir, görevi açana bir kez). Aynı alarm iki kez gönderilmez; birden çok sunucu çalışsa da tek kayıt oluşur.
