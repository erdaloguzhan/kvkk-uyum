# Deneme ortamı (staging) ve otomatik testler

## Otomatik testler (CI)

GitHub'da her PR açıldığında ve main'e her birleştirmede `.github/workflows/ci.yml` çalışır:

- Ortak paket, API ve web derlenir, tip kontrolü yapılır.
- API'nin tüm testleri gerçek bir PostgreSQL veritabanında çalışır.
- Bağımlılıklarda yüksek veya kritik güvenlik açığı varsa test kırmızı olur.
- API, web ve yedek Docker imajları derlenir.

PR sayfasında yeşil tik görünmeden PR birleştirilmemeli. İsterseniz GitHub'da **Settings → Branches → Branch protection rules** ile main için "Require status checks to pass" açıp bunu zorunlu yapabilirsiniz.

## Deneme ortamı

Canlıyla aynı sunucuda, ayrı veritabanıyla çalışan ikinci bir kurulumdur. Güncellemeler önce burada denenir, sonra canlıya alınır. Aylık yedek geri yükleme denemesi de burada yapılır (docs/FELAKET-KURTARMA.md).

- Adres şifre korumalıdır (kullanıcı adı `deneme`); arama motorlarına kapalıdır.
- Hiçbir e-posta gerçekten gönderilmez; tümü `https://DENEME-ALAN-ADI/posta/` adresinde görünür. Böylece canlı yedeği burada açılsa bile müşterilere yanlışlıkla e-posta gitmez.
- Sunucuda yaklaşık 1 GB ek bellek kullanır.

### Kurulum (bir kez)

1. DNS'te deneme adresi için (ör. `deneme.kvkuyum.com.tr`) canlı sunucunun IP adresini gösteren bir A kaydı açın.
2. Kodu ikinci bir klasöre indirin ve ayarları doldurun:
   ```
   git clone https://github.com/erdaloguzhan/kvkk-uyum.git /opt/kvkk-staging
   cd /opt/kvkk-staging
   cp deploy/staging.env.example .env && chmod 600 .env
   nano .env
   docker compose -f docker-compose.staging.yml up -d --build
   ```
   Canlı kurulum (`docker-compose.prod.yml`) önce çalışıyor olmalı; deneme ortamı onun ağına bağlanır.
3. Canlıdaki Caddy'ye deneme adresini tanıtın:
   ```
   cd /opt/kvkk
   docker compose -f docker-compose.prod.yml exec caddy caddy hash-password   # deneme şifresini yazın, çıkan özeti kopyalayın
   mkdir -p deploy/caddy-ek
   cp deploy/Caddyfile.staging deploy/caddy-ek/staging.caddy
   nano deploy/caddy-ek/staging.caddy    # DENEME-ALAN-ADI ve SIFRE-OZETI yerlerini doldurun
   docker compose -f docker-compose.prod.yml restart caddy
   ```

### Bir değişikliği denemek

```
cd /opt/kvkk-staging
git fetch && git checkout <dal-adı veya main>
docker compose -f docker-compose.staging.yml up -d --build
```

Deneme ortamında sorun yoksa aynı sürüm canlıya alınır (docs/CANLI-KURULUM.md "Güncelleme").

### Canlı yedeğini deneme ortamında açmak

```
cd /opt/kvkk-staging
docker compose -f docker-compose.staging.yml stop api web
docker compose -f docker-compose.staging.yml exec postgres \
  pg_restore --clean --if-exists --no-owner -U kvkk -d kvkk /backups/kvkk-2026-10-21-0300.dump
docker compose -f docker-compose.staging.yml start api web
```

Bu işlemden sonra deneme ortamında gerçek kişisel veriler bulunur: deneme bitince veritabanını sıfırlayın
(`docker compose -f docker-compose.staging.yml down -v` ve yeniden `up -d`).
