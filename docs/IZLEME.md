# İzleme ve uyarılar

Canlı sistemde bir sorun olduğunda bunu müşteriden önce sizin öğrenmeniz için üç katman vardır.

| Katman | Neyi yakalar | Nasıl haber verir | Kurulum |
| --- | --- | --- | --- |
| 1. Dış çalışma durumu kontrolü | Site açılmıyor, sunucu kapandı, veritabanı yanıt vermiyor, HTTPS sertifikasının süresi doluyor | E-posta ve telefon bildirimi (UptimeRobot uygulaması) | Bir kez, aşağıdaki adımlar |
| 2. Sistem uyarı e-postaları | Beklenmeyen sunucu hatası (500), hatırlatma/alarm taramasının çökmesi, sunucu diskinin %85'i geçmesi | `PLATFORM_ADMIN_EMAILS` adreslerine e-posta | Kendiliğinden çalışır |
| 3. Docker sağlık kontrolü | API veya web yanıt vermiyor | `docker ps` çıktısında `unhealthy` | Kendiliğinden çalışır |

## 1. Dış çalışma durumu kontrolü (UptimeRobot)

Sistem tamamen durursa kendisi e-posta gönderemez; bunu sistemin dışından bakan bir servis yakalamalı. UptimeRobot'un ücretsiz planı yeterlidir (5 dakikada bir kontrol, 50 adres).

1. https://uptimerobot.com adresinde ücretsiz hesap açın.
2. **New monitor** → tür **Keyword**:
   - URL: `https://ALAN-ADINIZ/api/v1/health`
   - Keyword: `ok` (sayfada **bulunmalı**)
   - Aralık: 5 dakika
   Bu adres web sunucusu, API ve veritabanının üçünü birden dener; biri çalışmıyorsa uyarı gelir.
3. İkinci bir **HTTP(s)** monitörü ekleyin: `https://ALAN-ADINIZ/giris`. Ayarlardan **SSL expiry reminder** seçeneğini açın; sertifika yenilenemezse 30 gün önceden haber verir.
4. **Alert contacts** bölümüne e-posta adresinizi ekleyin; telefonunuza UptimeRobot uygulamasını kurarsanız anlık bildirim de gelir.
5. (İsteğe bağlı) **Status page** oluşturup müşterilere "sistem durumu" sayfası olarak verebilirsiniz.

Deneme: sunucuda `docker compose -f docker-compose.prod.yml stop web` çalıştırın, 5-10 dakika içinde uyarı gelmeli; sonra `start web` ile geri açın.

## 2. Sistem uyarı e-postaları

API beklenmeyen bir hata aldığında (kullanıcıya "bir hata oluştu" görünen durumlar) `PLATFORM_ADMIN_EMAILS` içindeki adreslere e-posta gönderir. E-postada hatanın yeri (ör. `POST /api/v1/inventory/import`), hata mesajı ve zamanı vardır; istek içeriği ve kişisel veri yoktur.

- Aynı türden uyarı en fazla **15 dakikada bir** gelir. Aradaki hatalar sayılır ve bir sonraki e-postada "(N yeni)" olarak özetlenir.
- Disk doluluğu saatte bir kontrol edilir; %85'i geçerse uyarı gelir. Disk dolarsa veritabanı yazamaz ve sistem durur.
- Kullanıcı hataları (yanlış şifre, eksik alan, yetkisiz işlem, bulunamayan kayıt) uyarı üretmez.

Uyarı gelince ayrıntıya bakmak için sunucuda:

```
docker compose -f docker-compose.prod.yml logs --since 1h api
```

## 3. Docker sağlık kontrolü

API ve web imajları 30 saniyede bir kendilerini kontrol eder:

```
docker compose -f docker-compose.prod.yml ps
```

`STATUS` sütununda `healthy` görünmeli. `unhealthy` ise ilgili servisin logları incelenmeli ve gerekirse `docker compose -f docker-compose.prod.yml restart api` ile yeniden başlatılmalı.

## Haftalık kontrol (5 dakika)

- UptimeRobot panelinde geçen haftanın çalışma oranı %99,5'in üzerinde mi?
- Gelen uyarı e-postalarının hepsi incelendi mi, tekrar eden bir hata var mı?
- `df -h` ile disk doluluğu ve yedek klasörünün boyutu makul mü?
- Sunucu sağlayıcısının (Turhost) panelinde CPU ve bellek kullanımı sürekli yüksek mi?
