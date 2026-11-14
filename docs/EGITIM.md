# Uzaktan eğitim modülü

Erdal'ın "Eğitim Modülü" dokümanındaki arayüz tanımları ve veri tabanı taslağı esas alındı. Taslaktan farklı
olan noktalar ve nedenleri:

| Taslakta | Sistemde | Neden |
| --- | --- | --- |
| Ön test ve son test için ayrı soru, sınav ve sonuç tabloları (8 tablo) | `training_questions`, `training_exam_attempts`, `training_exam_answers` tablolarında `test_type` = `pre` / `post` | Aynı yapı iki kez tekrarlanmıyor; iki test aynı kodla çalışıyor. |
| Ayrı "Sınavlar" tablosu (sınav ID + soru ID) | Yok: bir eğitimin bir test türündeki soruları o testin sınavıdır | Sınav ID'nin taşıdığı bilgi zaten eğitim + test türü. Puan toplamı 100 kuralı korunuyor. |
| Kayıtlar T.C. kimlik no ile birbirine bağlı | Kayıtlar iç kimliklerle (uuid) bağlı; çalışan ve eğitimcide T.C. kimlik no **tutulmaz** (veri minimizasyonu, Erdal 14.11.2026; 0029 migration'ı mevcut numaraları sildi) | Eğitim için gerekli değil; çalışan kuruluş içinde cep telefonuyla, Excel içe aktarmada telefon (yoksa e-posta) ile eşleştirilir. |
| Çalışan tablosunda şifre | Şifre yok: Eğitim Portalına cep telefonu + SMS kodu ile girilir (`portal_login_codes`; Erdal, 26.10.2026). Eski `training_accounts` tablosu 0018 migration'ında kaldırıldı | Çalışanın şifre hatırlaması gerekmez; birden çok kuruluşta kayıtlı kişi aynı telefonla tüm eğitimlerini ve dokümanlarını görür. |
| Eğitimcide e-posta ve şifre | Eğitimci `users` tablosundaki hesabıyla girer (doğrulama kodu dahil) | Eğitimci yönetim paneline giriyor; ayrı bir giriş sistemi gerekmiyor. |
| Alt konuda okuma süresi alanı yok | `training_topics.min_read_seconds` | Dokümandaki "süre dolmadan geçilemez" kuralı için gerekli. |
| Geçme notu 70 sabit | `trainings.pass_score` (varsayılan 70) | Eğitim bazında değiştirilebilir. |
| Sonuç "Master" ve "Detay" | `training_exam_attempts` (master: not, tarih, başarı) ve `training_exam_answers` (detay: cevap, puan) | Aynı ayrım, tek tablo çifti. |

## Kurallar (sunucuda uygulanır)

- Eğitimci eğitimde değil, **eğitim grubunda** seçilir (zorunlu, yalnızca aktif eğitimci; 25.10.2026, Erdal). Sertifikada
  grubun eğitimcisi yazar; grup sayfasındaki "Düzenle" ile değiştirilebilir.

- Eğitim **yayına** alınmadan gruba atanamaz: en az bir alt konu, ön test ve son test puanları toplamı 100.
- Katılımcı sınavı çözdükten sonra o eğitimin soruları değiştirilemez (sonuçlar sorulara bağlı).
- Ön test bir kez çözülür, notu kaydedilir, sonucu etkilemez.
- Her alt konu en az okuma süresi kadar gösterilmeden sonrakine geçilemez; sayaç tarayıcıda yalnızca gösterim içindir.
- Konu ilerlemesi portal oturumuna bağlıdır: eğitimi bitirmeden çıkıp yeniden giren katılımcı konulara baştan başlar
  (ön test tekrar sorulmaz).
- Son testte geçme notunun altında kalan katılımcı konuları yeniden okuyup son testi tekrar çözer. Sonuç ekranında
  başarılı denemenin notu (yoksa son denemenin notu) ve deneme sayısı görünür. *(Dokümanda başarısızlık sonrası
  belirtilmediği için seçilen varsayılan.)*
- Eğitim Portalına şifresiz girilir: çalışan cep telefonunu yazar, telefonuna 5 dakika geçerli 6 haneli SMS kodu gelir
  (5 deneme; bir telefona 10 dakikada en fazla 3, günde 10 kod; CAPTCHA). Telefon `05XXXXXXXXX` biçiminde saklanır
  (boşluklu, tireli, +90'lı yazımlar çevrilir) ve yalnızca bir kişiye ait olabilir: kuruluş içinde tek çalışanda bulunur; başka kuruluşta
  ancak aynı ad soyadla (aynı kişi) kayıtlı olabilir. Kod ekranında kişinin adı gösterilmez (telefonun kime ait olduğu anlaşılmasın).
- Eğitim başlatılınca ve platform yöneticisi portal erişimi gönderince çalışana Eğitim Portalı adresini içeren SMS gider; e-postası
  varsa ayrıca e-posta gider. SMS başlığı `SMS_HEADER` (canlıda `Bi ARTI`).
- Eğitim ve portal erişimi cep telefonu olmayan çalışana gönderilemez; gönderimde atlanır ve bildirilir.
- Katılımcının portal oturumu 4 saattir; yönetim ve müşteri ekranı oturumlarından tamamen ayrıdır.

## Yetkiler

- **Platform yöneticisi:** her şey; kuruluş çalışanları (kuruluş sayfasında) ve eğitimciler yalnızca onun.
- **Eğitimci:** eğitim içerikleri, sorular, gruplar, gönderim, sonuçlar ve sertifika. Pasif eğitimci giremez.
- **Katılımcı:** yalnızca Eğitim Portalı (`/egitim`: Özet, KVK Dokümanları, Eğitimlerim, Profil) ve kendisine gönderilen eğitimler.

## Çalışanların doküman erişimi

Ana sistemde ayrı İzleyici hesabı yoktur. Çalışan, Eğitim Portalına telefonuyla girip kuruluşunun yayınlanmış
KVKK dokümanlarını portalda okur (`GET /training-portal/documents`, `GET /training-portal/documents/:id`); Word indirme yoktur
(2026-10-28). Dokümanın sonunda "Okudum, anladım." onayı verilir (`POST /training-portal/documents/:id/read`).

- Yalnızca yayındaki sürüm ve "Çalışanlar görebilsin" işaretli dokümanlar görünür (varsayılan açık; doküman
  sayfasında KVKK Sorumlusu kapatabilir).
- Telefonla eşleşen ve işten çıkış tarihi geçmemiş çalışan kayıtlarının kuruluşları esas alınır.
- Eğitime eklenmemiş çalışana platform yöneticisi kuruluş sayfasından portal erişimi gönderir
  (`POST /admin/organizations/:orgId/employees/portal-access`); çalışana portal adresini içeren SMS gider.


## Hazır içerik: KVKK Farkındalık Eğitimi

17 alt konu (görselleriyle), 10 soruluk ön test ve 10 soruluk son test `apps/api/src/scripts/icerik/kvkk-farkindalik.ts`
dosyasındadır; görseller `apps/api/assets/egitim/kvkk-farkindalik/` altındadır (yeniden üretmek için
`node tools/egitim-gorselleri/uret.mjs`). Sunucuda yüklemek için (`/opt/kvkk` klasöründe, güncel kod derlendikten sonra):

```
docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-icerik-yukle.js --deneme
docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-icerik-yukle.js
```

- "KVKK Farkındalık Eğitimi" adlı eğitim varsa ona, yoksa yeni bir taslak eğitime yükler. Eğitim durumu değişmez.
- Eğitimde zaten alt konu veya soru varsa durur; `--degistir` ile eskileri silinip yenileri yüklenir.
- Eğitime başlamış katılımcı varsa `--degistir` de çalışmaz (ilerleme ve sınav sonuçları bozulmasın diye).
  Bu durumda `--ad "KVKK Farkındalık Eğitimi 2026"` gibi yeni bir adla yüklenebilir.
- Konunun en kısa okuma süresi = kelime sayısı / 150 kelime-dakika + görsel için 10 sn, 30 sn'ye yukarı yuvarlanır,
  en az 60 sn. Yükledikten sonra yönetim panelinden konu konu değiştirilebilir.
- İdari para cezası tutarları 2026 yılına göredir; her yıl yeniden değerleme oranıyla güncellenmelidir.

## Deneme eğitimini tamamen silme

Gruba atanıp gönderilmiş bir eğitim panelden silinemez (eğitim kanıtı korunsun diye). Yalnızca deneme kayıtları için:

```
docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-sil.js --ad "Eğitimin tam adı"
docker compose -f docker-compose.prod.yml exec api node dist/scripts/egitim-sil.js --ad "Eğitimin tam adı" --onay <katılımcı sayısı>
```

İlk komut hiçbir şey silmez, silinecekleri ve onay sayısını gösterir. İkincisi eğitimi, gruplarını, katılımcı
kayıtlarını, sınav sonuçlarını ve yalnızca bu eğitimde kullanılan görselleri siler; geri alınamaz.
