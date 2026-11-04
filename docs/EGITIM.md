# Uzaktan eğitim modülü

Erdal'ın "Eğitim Modülü" dokümanındaki arayüz tanımları ve veri tabanı taslağı esas alındı. Taslaktan farklı
olan noktalar ve nedenleri:

| Taslakta | Sistemde | Neden |
| --- | --- | --- |
| Ön test ve son test için ayrı soru, sınav ve sonuç tabloları (8 tablo) | `training_questions`, `training_exam_attempts`, `training_exam_answers` tablolarında `test_type` = `pre` / `post` | Aynı yapı iki kez tekrarlanmıyor; iki test aynı kodla çalışıyor. |
| Ayrı "Sınavlar" tablosu (sınav ID + soru ID) | Yok: bir eğitimin bir test türündeki soruları o testin sınavıdır | Sınav ID'nin taşıdığı bilgi zaten eğitim + test türü. Puan toplamı 100 kuralı korunuyor. |
| Kayıtlar T.C. kimlik no ile birbirine bağlı | Kayıtlar iç kimliklerle (uuid) bağlı; T.C. no çalışan ve eğitimci kaydında | Aynı kişi birden çok kuruluşta çalışan olabilir; T.C. no düzeltilirse geçmiş kayıtlar kopmaz. |
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
  (boşluklu, tireli, +90'lı yazımlar çevrilir) ve yalnızca bir kişiye (T.C. kimlik no) ait olabilir; aynı kişi başka kuruluşta
  aynı telefonla kayıtlı olabilir. Kod ekranında kişinin adı gösterilmez (telefonun kime ait olduğu anlaşılmasın).
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

