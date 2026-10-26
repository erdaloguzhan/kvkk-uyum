# Canlı ortama kurulum

Bu belge sistemi gerçek kullanıcılar için bir sunucuya kurmayı anlatır. Yerelde denemek için
[YEREL-KURULUM.md](YEREL-KURULUM.md) yeterlidir; bu belgedeki ayarlar yerel kurulumda gerekmez.

Kurulum tek bir Linux sunucuda (VPS veya bulut sunucu) Docker ile çalışır:

| Servis | Görevi | Dışarıya açık mı? |
| --- | --- | --- |
| caddy | HTTPS, sertifika (Let's Encrypt), güvenlik başlıkları | Evet: 80 ve 443 |
| web | Web arayüzü | Hayır |
| api | Sunucu uygulaması, e-posta ve hatırlatmalar | Hayır |
| postgres | Veritabanı | Hayır |
| backup | Her gece veritabanı yedeği (`yedekler/` klasörü) | Hayır |

## 1. Sunucu ve ön koşullar

- **Yer:** Kişisel veriler (çalışan adları, T.C. kimlik no, e-postalar) yurt dışına aktarım sayılmasın diye
  sunucu **Türkiye'deki bir veri merkezinde** olmalıdır. Sağlayıcıyla yapılan sözleşmede verinin Türkiye'de
  tutulduğu yazmalıdır.
- **Boyut:** Başlangıç için 2 vCPU, 4 GB RAM, 40 GB SSD yeterlidir. İşletim sistemi: Ubuntu 24.04 LTS.
- **Alan adı:** Ör. `uyum.firmaniz.com.tr`. DNS'te bu ad için sunucunun IP adresini gösteren bir **A kaydı** açın.
- **E-posta (SMTP):** Giriş kodları ve bildirimler için gerçek bir gönderim hesabı. Alan adınız için SPF ve DKIM
  kayıtlarını sağlayıcının anlattığı şekilde ekleyin; yoksa e-postalar spam'e düşer.
- **Güvenlik duvarı:** Sunucuda yalnızca 22 (SSH), 80 ve 443 portları açık olmalı. SSH'ye şifreyle değil anahtarla girilmeli.

## 2. Docker'ı kurun

```
curl -fsSL https://get.docker.com | sh
```

## 3. Kodu indirin ve ayarları yapın

```
git clone https://github.com/erdaloguzhan/kvkk-uyum.git /opt/kvkk
cd /opt/kvkk
cp deploy/.env.prod.example .env
chmod 600 .env
nano .env
```

`.env` dosyasındaki her değeri doldurun. Şifre ve anahtarları şu komutlarla üretin:

```
openssl rand -hex 24      # POSTGRES_PASSWORD (base64 kullanmayın: / + = veritabanı adresini bozar)
openssl rand -hex 48      # JWT_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY (tam 32 bayt base64 olmalı)
```

`SMTP_URL` içindeki kullanıcı adında `@` varsa `%40` yazılır; şifrede `@ : / ? #` gibi karakterler varsa
onlar da kodlanmalıdır (ör. `smtp://info%40ornek.com.tr:SIFRE@mail.ornek.com.tr:587`).

> **DATA_ENCRYPTION_KEY çok önemlidir.** T.C. kimlik numaraları bu anahtarla şifrelenir. Anahtar kaybolursa
> yedekler dahil hiçbir yerden kimlik numaraları geri okunamaz. `.env` dosyasının bir kopyasını sunucu dışında,
> güvenli bir yerde (ör. şifre yöneticisi) saklayın. Kurulumdan sonra bu anahtarı değiştirmeyin.

## 4. Başlatın

```
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api
```

Logda `Migration tamamlandı` ve `Nest application successfully started` görününce `https://ALAN-ADINIZ` adresini
açın. `PLATFORM_ADMIN_EMAILS` içindeki adreslere şifre oluşturma e-postası gider; bu hesapla `/admin`
adresinden yönetim paneline girilir.

## 5. Güncelleme

```
cd /opt/kvkk
docker compose -f docker-compose.prod.yml exec backup bash /backup.sh now   # önce yedek
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Veritabanı değişiklikleri (migration) API açılırken otomatik uygulanır.

## 6. Yedekler

- `backup` servisi her gün `BACKUP_HOUR` saatinde (varsayılan 03:00) `yedekler/kvkk-TARİH.dump` dosyası oluşturur
  ve `BACKUP_KEEP_DAYS` günden (varsayılan 14) eskileri siler.
- Elle yedek: `docker compose -f docker-compose.prod.yml exec backup bash /backup.sh now`
- Son yedekler: `ls -lh yedekler/`
- **Sunucu dışına kopya:** Sunucu tamamen kaybolursa yerel yedekler de gider. `offsite` servisi yedekleri her gün
  şifreleyip başka bir sunucuya veya nesne depolamaya (Türkiye'de) kopyalar; kurulumu ve felaket durumunda geri
  yükleme adımları [FELAKET-KURTARMA.md](FELAKET-KURTARMA.md) dosyasındadır. Sağlayıcının disk anlık görüntü
  (snapshot) özelliğini de açın.
- Yedeklerde T.C. kimlik numaraları şifrelidir; ama adlar ve e-postalar açıktır. Yedek dosyalarına erişimi kısıtlayın.

### Yedekten geri yükleme

Bu işlem veritabanındaki **mevcut verilerin yerine** yedektekileri koyar.

```
cd /opt/kvkk
docker compose -f docker-compose.prod.yml stop api web
docker compose -f docker-compose.prod.yml exec backup \
  pg_restore --clean --if-exists --no-owner -d kvkk /backups/kvkk-2026-10-21-0300.dump
docker compose -f docker-compose.prod.yml start api web
```

Geri yüklenen veriler yalnızca yedeği alan kurulumun `DATA_ENCRYPTION_KEY` anahtarıyla okunabilir.
Yedeğin gerçekten geri yüklenebildiğini ayda bir, ayrı bir deneme sunucusunda kontrol edin.

## 7. Canlıya açmadan önce kontrol listesi

- [ ] Sunucu Türkiye'de, sözleşmede veri yeri yazılı
- [ ] `.env` dolduruldu, tüm şifreler rastgele üretildi, `.env` kopyası güvenli yerde
- [ ] `https://ALAN-ADINIZ` kilit simgesiyle açılıyor, `http://` adresi HTTPS'e yönleniyor
- [ ] Dışarıdan 5432 ve 3000 portlarına bağlanılamıyor
- [ ] Giriş kodu e-postası gerçek bir adrese geliyor (spam klasörüne değil)
- [ ] `yedekler/` klasöründe ilk yedek oluştu ve `offsite` servisi sunucu dışına kopyalıyor ([FELAKET-KURTARMA.md](FELAKET-KURTARMA.md))
- [ ] Bir yedek deneme ortamına geri yüklenip açıldı ([STAGING.md](STAGING.md))
- [ ] UptimeRobot kontrolleri kuruldu, uyarı e-postası denendi ([IZLEME.md](IZLEME.md))
- [ ] Yerel denemeden kalan test verisi (seed) canlıya yüklenmedi
