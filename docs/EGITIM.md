# Uzaktan eğitim modülü

Erdal'ın "Eğitim Modülü" dokümanındaki arayüz tanımları ve veri tabanı taslağı esas alındı. Taslaktan farklı
olan noktalar ve nedenleri:

| Taslakta | Sistemde | Neden |
| --- | --- | --- |
| Ön test ve son test için ayrı soru, sınav ve sonuç tabloları (8 tablo) | `training_questions`, `training_exam_attempts`, `training_exam_answers` tablolarında `test_type` = `pre` / `post` | Aynı yapı iki kez tekrarlanmıyor; iki test aynı kodla çalışıyor. |
| Ayrı "Sınavlar" tablosu (sınav ID + soru ID) | Yok: bir eğitimin bir test türündeki soruları o testin sınavıdır | Sınav ID'nin taşıdığı bilgi zaten eğitim + test türü. Puan toplamı 100 kuralı korunuyor. |
| Kayıtlar T.C. kimlik no ile birbirine bağlı | Kayıtlar iç kimliklerle (uuid) bağlı; T.C. no çalışan ve eğitimci kaydında | Aynı kişi birden çok kuruluşta çalışan olabilir; T.C. no düzeltilirse geçmiş kayıtlar kopmaz. |
| Şifre "encrypted" | Tuzlanmış scrypt özeti (geri çözülemez) | Mevcut sistemle aynı ve daha güvenli: şifre veri tabanı ele geçse de okunamaz. |
| Çalışan tablosunda şifre | `training_accounts`: kullanıcı adı e-posta, şifre özeti, ilk girişte şifre değiştirme | Birden çok kuruluşta kayıtlı kişi tek hesapla tüm eğitimlerini görür. |
| Eğitimcide e-posta ve şifre | Eğitimci `users` tablosundaki hesabıyla girer (doğrulama kodu dahil) | Eğitimci yönetim paneline giriyor; ayrı bir giriş sistemi gerekmiyor. |
| Alt konuda okuma süresi alanı yok | `training_topics.min_read_seconds` | Dokümandaki "süre dolmadan geçilemez" kuralı için gerekli. |
| Geçme notu 70 sabit | `trainings.pass_score` (varsayılan 70) | Eğitim bazında değiştirilebilir. |
| Sonuç "Master" ve "Detay" | `training_exam_attempts` (master: not, tarih, başarı) ve `training_exam_answers` (detay: cevap, puan) | Aynı ayrım, tek tablo çifti. |

## Kurallar (sunucuda uygulanır)

- Eğitim **yayına** alınmadan gruba atanamaz: en az bir alt konu, ön test ve son test puanları toplamı 100.
- Katılımcı sınavı çözdükten sonra o eğitimin soruları değiştirilemez (sonuçlar sorulara bağlı).
- Ön test bir kez çözülür, notu kaydedilir, sonucu etkilemez.
- Her alt konu en az okuma süresi kadar gösterilmeden sonrakine geçilemez; sayaç tarayıcıda yalnızca gösterim içindir.
- Konu ilerlemesi portal oturumuna bağlıdır: eğitimi bitirmeden çıkıp yeniden giren katılımcı konulara baştan başlar
  (ön test tekrar sorulmaz).
- Son testte geçme notunun altında kalan katılımcı konuları yeniden okuyup son testi tekrar çözer. Sonuç ekranında
  başarılı denemenin notu (yoksa son denemenin notu) ve deneme sayısı görünür. *(Dokümanda başarısızlık sonrası
  belirtilmediği için seçilen varsayılan.)*
- Eğitim, e-postası olmayan çalışana gönderilemez; gönderimde atlanır ve bildirilir.
- Katılımcının portal oturumu 4 saattir; yönetim ve müşteri ekranı oturumlarından tamamen ayrıdır.

## Yetkiler

- **Platform yöneticisi:** her şey; kuruluş çalışanları (kuruluş sayfasında) ve eğitimciler yalnızca onun.
- **Eğitimci:** eğitim içerikleri, sorular, gruplar, gönderim, sonuçlar ve sertifika. Pasif eğitimci giremez.
- **Katılımcı:** yalnızca Eğitim Portalı (`/egitim`) ve kendisine gönderilen eğitimler.
