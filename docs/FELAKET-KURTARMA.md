# Yedekleme ve felaket kurtarma planı

Bu plan, canlı sunucu kısmen veya tamamen kaybolduğunda sistemin nasıl geri getirileceğini anlatır.

## Hedefler

| Hedef | Değer | Anlamı |
| --- | --- | --- |
| En fazla veri kaybı (RPO) | 24 saat | Yedek her gece alınır; en kötü durumda son yedekten sonraki gün kaybolur. |
| En fazla kesinti (RTO) | 4 saat | Sunucu tamamen kaybolsa da yeni sunucuda sistem 4 saat içinde açılır. |

## Neler nerede saklanıyor

| Ne | Nerede | Kim erişebilir |
| --- | --- | --- |
| Günlük veritabanı yedeği (son 14 gün) | Canlı sunucu, `yedekler/` klasörü | Sunucuya SSH ile girenler |
| Şifreli yedek kopyası (son 30 gün sunucuda, 90 gün bilgisayarda) | Yöneticinin Windows bilgisayarı (`C:\KVKK-Yedek`); başka hedef de seçilebilir (ikinci sunucu veya nesne depolama, Türkiye'de) | Hedefin hesabı olanlar; parola olmadan açılamaz |
| `.env` (veritabanı şifresi, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`) | Canlı sunucu + **şifre yöneticisi** | Yalnızca sistem yöneticisi |
| `offsite.env` (`OFFSITE_PASSPHRASE`, hedefin erişim bilgileri) | Canlı sunucu + **şifre yöneticisi** | Yalnızca sistem yöneticisi |
| Uygulama kodu ve doküman şablonları | GitHub (`erdaloguzhan/kvkk-uyum`) | Depoya erişimi olanlar |

`DATA_ENCRYPTION_KEY` veya `OFFSITE_PASSPHRASE` kaybolursa yedekler işe yaramaz: ilkinde T.C. kimlik numaraları, ikincisinde yedeğin tamamı açılamaz. İkisini de şifre yöneticisinde, sunucudan bağımsız saklayın ve en az iki kişinin erişebildiğinden emin olun.

## Sunucu dışı yedeğin kurulması

1. **Hedef seçin (Türkiye'de olmalı).** En basiti, canlı sunucudan farklı bir sağlayıcıda veya farklı bir veri merkezinde küçük bir sunucu (1 vCPU, 20 GB disk yeterli). Sağlayıcı S3 uyumlu nesne depolama sunuyorsa o da olur.
2. İkinci sunucuda yalnızca yedek için bir kullanıcı açın: `adduser yedek`. Bu kullanıcının sunucuda başka yetkisi olmasın.
3. Canlı sunucuda ayar dosyasını oluşturun:
   ```
   cd /opt/kvkk
   cp deploy/offsite.env.example offsite.env && chmod 600 offsite.env
   nano offsite.env       # OFFSITE_PASSPHRASE ve hedef bilgilerini doldurun
   ```
   SFTP şifresini dosyaya yazmadan önce gizleyin: `docker run --rm rclone/rclone obscure 'SIFRE'`.
4. **İzleme:** https://healthchecks.io adresinde ücretsiz hesap açın, "Period 1 day, Grace 2 hours" ayarlı bir kontrol oluşturun ve verdiği adresi `OFFSITE_PING_URL` olarak yazın. Bir gün kopya gelmezse e-posta alırsınız.
5. Servisi başlatın ve hemen bir kopya alıp deneyin:
   ```
   docker compose -f docker-compose.prod.yml -f docker-compose.offsite.yml up -d --build
   docker compose -f docker-compose.prod.yml -f docker-compose.offsite.yml exec offsite bash /offsite-backup.sh now
   ```
   `sunucu dışına kopyalandı` satırlarını görmelisiniz.
6. **Hedef yöneticinin Windows bilgisayarıysa** (Seçenek C): `offsite.env` içinde `RCLONE_CONFIG_OFFSITE_TYPE=local` ve `OFFSITE_PATH=/backups/sifreli` olur; şifreli kopyalar sunucuda `yedekler/sifreli` klasöründe birikir. Bilgisayarda `deploy/yedek-cek.ps1` Görev Zamanlayıcı ile her gün çalıştırılır ve yeni dosyaları `C:\KVKK-Yedek` klasörüne indirir (OneDrive gibi bulutla eşitlenen bir klasöre değil). Bilgisayarın diski BitLocker ile şifreli olmalı. Bu hedefte kopya bilgisayar açıkken iner; geri yüklemede dosya yeni sunucuya `scp` ile gönderilir ve 3. adımdaki `gpg` komutuyla açılır.
7. Sağlayıcının panelinde sunucu **anlık görüntü (snapshot)** özelliği varsa haftalık olarak açın. Bu, yedekten bağımsız ikinci bir güvencedir.

Bundan sonra her gün 03:00'te yedek alınır, 04:30'da şifrelenip sunucu dışına kopyalanır.

## Senaryolar

| Durum | Ne yapılır | Kaynak |
| --- | --- | --- |
| Bir müşterinin verisi yanlışlıkla silindi veya bozuldu | Sistem durdurulmadan yedek ayrı bir veritabanına açılır, ilgili kayıtlar elle geri taşınır | Yerel yedek |
| Hatalı bir güncelleme veritabanını bozdu | Güncellemeden önce alınan yedek geri yüklenir (Geri yükleme A) | Yerel yedek |
| Sunucu kayboldu (disk arızası, sağlayıcı hesabı kapandı) | Yeni sunucu kurulur, sunucu dışı yedek geri yüklenir (Geri yükleme B) | Sunucu dışı yedek |
| Sunucu ele geçirildi (fidye yazılımı, yetkisiz erişim) | Sunucu kapatılır; yeni sunucuda **tüm şifreler değiştirilerek** Geri yükleme B; saldırıdan önceki bir yedek seçilir | Sunucu dışı yedek |
| Sağlayıcıda geçici kesinti | Sağlayıcının açıklaması beklenir; 4 saati geçecekse Geri yükleme B başka sağlayıcıda yapılır | Sunucu dışı yedek |

Ele geçirme veya veri kaybı kişisel veri ihlali sayılabilir. Bu durumda etkilenen müşterilere (veri sorumlusu onlar) gecikmeden haber verilmeli; Kişisel Verileri Koruma Kurulu'na bildirim yükümlülüğü ve süresi için hukuk danışmanınıza başvurun. Olayın zamanı, kapsamı ve yapılanlar yazılı tutulmalı.

## Geri yükleme A: aynı sunucuda, yerel yedekten

Yerel yedekten geri yükleme adımları `docs/CANLI-KURULUM.md` dosyasındaki "Yedekten geri yükleme" bölümündedir. Geri yüklemeden önce bozuk hâlin de yedeğini alın (`bash /backup.sh now`), gerekirse sonradan bakılabilsin.

## Geri yükleme B: yeni sunucuda, sunucu dışı yedekten

Tahmini süre 1-2 saat.

1. Yeni sunucuyu `docs/CANLI-KURULUM.md` 1-2. adımlarına göre hazırlayın (Docker, güvenlik duvarı, kodun indirilmesi).
2. Şifre yöneticisindeki `.env` ve `offsite.env` dosyalarını proje klasörüne koyun. Ele geçirme durumunda `.env` içindeki `POSTGRES_PASSWORD` ve `JWT_SECRET` değerlerini yenileyin; `DATA_ENCRYPTION_KEY` **aynı kalmalı**, yoksa kimlik numaraları okunamaz.
3. Yedekleri indirip açın:
   ```
   mkdir -p yedekler
   docker compose -f docker-compose.prod.yml -f docker-compose.offsite.yml run --rm --entrypoint bash offsite -c \
     'rclone lsl offsite:$OFFSITE_PATH'
   # listeden geri yüklenecek dosyayı seçin, ör. kvkk-2026-10-21-0300.dump.gpg
   docker compose -f docker-compose.prod.yml -f docker-compose.offsite.yml run --rm --entrypoint bash offsite -c \
     'rclone copyto offsite:$OFFSITE_PATH/kvkk-2026-10-21-0300.dump.gpg /backups/geri.dump.gpg &&
      gpg --batch --pinentry-mode loopback --passphrase "$OFFSITE_PASSPHRASE" -o /backups/geri.dump -d /backups/geri.dump.gpg &&
      rm /backups/geri.dump.gpg'
   ```
4. Yalnızca veritabanını başlatıp yedeği yükleyin, sonra sistemi açın:
   ```
   docker compose -f docker-compose.prod.yml up -d postgres backup
   docker compose -f docker-compose.prod.yml exec backup pg_restore --clean --if-exists --no-owner -d kvkk /backups/geri.dump
   docker compose -f docker-compose.prod.yml -f docker-compose.offsite.yml up -d --build
   ```
5. Alan adının DNS A kaydını yeni sunucunun IP adresine çevirin (yayılması birkaç dakika ile birkaç saat sürebilir). Caddy sertifikayı kendisi alır.
6. Kontrol: bir müşteri hesabıyla girip dokümanların, envanterin ve bir çalışanın T.C. kimlik numarasının göründüğünü doğrulayın; UptimeRobot'un yeşile döndüğünü görün.
7. Müşterilere kesintinin süresini ve kaybolan veri aralığını (son yedekten bu yana) yazılı bildirin.

## Aylık geri yükleme denemesi

Hiç denenmemiş yedek, yedek sayılmaz. Her ayın ilk iş günü:

- [ ] Sunucu dışındaki en yeni kopyayı deneme ortamına (staging) Geri yükleme B adımlarıyla yükleyin.
- [ ] Bir kuruluşun doküman, envanter ve çalışan sayılarının canlıdakiyle uyuştuğunu kontrol edin.
- [ ] Geçen süreyi ve sorunları aşağıdaki tabloya yazın.

| Tarih | Yedek dosyası | Süre | Sonuç / not |
| --- | --- | --- | --- |
| | | | |
