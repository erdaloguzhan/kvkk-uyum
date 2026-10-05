# KVK Yönetim Sistemi

KVKK uyum yönetimi için web, iOS ve Android uygulaması. Mimari ve modül sırası: [docs/MIMARI.md](docs/MIMARI.md).

## Durum

| Bileşen | Durum |
|---|---|
| `apps/api` — Temel modül: giriş (şifre + e-posta kodu), CAPTCHA, hız sınırı, hesap kilidi, şifre sıfırlama/davet, kuruluşlar, üyeler, roller/yetkiler, sistem logu | Hazır, testli |
| `packages/shared` — Yetki anahtarları, varsayılan roller, doküman yer tutucuları | Hazır |
| `apps/web` (Next.js), `apps/mobile` (Expo) | Sırada |

## Çalıştırma

Gerekenler: Node 22, pnpm 10, PostgreSQL 16 (veya `docker compose up -d`).

```bash
pnpm install
pnpm --filter @kvkk/shared build
cd apps/api
cp .env.example .env            # değerleri düzenleyin
export $(grep -v '^#' .env | xargs)
pnpm build && pnpm db:migrate
pnpm start                      # http://localhost:3000/api/v1/health
```

Geliştirmede e-postalar (giriş kodu, davet) gönderilmez, API loguna yazılır.

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
| `POST /organizations` | Giriş yapmış (oluşturan Kuruluş Yöneticisi olur) |
| `GET /organizations/current` | `org.read` |
| `PATCH /organizations/current`, `POST /organizations/current/complete-setup` | `org.manage` |
| `GET /members`, `GET /roles` | `users.read` |
| `POST/PATCH/DELETE /members` | `users.manage` |
| `POST/PATCH/DELETE /roles` | `roles.manage` |
| `GET /audit-logs` | `audit.read` |
