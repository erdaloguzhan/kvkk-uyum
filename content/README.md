# KVKK doküman içerikleri

Erdal'ın 2026-10-06'da sağladığı dokümanlar. Bunlar sistemin **şablonlarıdır**: Doküman Yönetimi modülü
her kuruluş için bunları kuruluş profilindeki bilgilerle doldurup yayınlayacak. Hukuki metin sistem
tarafından üretilmez; yalnızca buradaki içerik kullanılır.

- Tüm şablonlar `.docx` biçimindedir. Orijinali `.doc` olanlar LibreOffice ile `.docx`'e çevrildi;
  orijinaller `_orijinal/` klasöründe duruyor.
- 16 şablonun tamamı örnek firma bilgileriyle doldurulup test edildi; doldurulmadan kalan yer tutucu yok.

## Yer tutucular

| Yer tutucu | Kuruluş profil alanı | Kullanıldığı dokümanlar |
|---|---|---|
| `{{kurum.unvan}}` | Firma ünvanı | FRM-020 hariç hepsi |
| `{{kurum.adresi}}` | Adres | AYM-010/020/030/040/050, SZL-010, SZL-020 |
| `{{kurum.vergi_no}}` | Vergi numarası | AYM-010/020/030/040/050, SZL-020 |
| `{{kurum.web_sitesi_adresi}}` | Web sitesi | AYM-010/020/030/040/041/050 |
| `{{kurum.logo}}` | Firma logosu (görsel) | AYM-041 — henüz desteklenmiyor, logo yükleme ile eklenecek |

Ek olarak kullanılabilir: `{{kurum.eposta}}`, `{{kurum.telefon}}`, `{{kurum.kep}}`, `{{kurum.yetkili}}`.
`{{ kurum.unvan }}` gibi boşluklu yazım da geçerlidir.

## Katalog

| Kod | Doküman | Tür | Durum |
|---|---|---|---|
| POL-010 | Kişisel Verilerin İşlenmesi, Korunması ve İmha Politikası | Politika | Kullanımda |
| POL-020 | Kişisel Verileri Saklama ve İmha Politikası | Politika | Kullanımda |
| PRS-010 | İlgili Kişi İşlemleri Prosedürü | Prosedür | Kullanımda |
| PRS-020 | Veri Yedekleme Prosedürü | Prosedür | Kullanımda |
| PRS-030 | Veri İhlal Olay Yönetimi Prosedürü | Prosedür | Kullanımda |
| FRM-010 | Veri Sahibi Başvuru Formu | Form | Kullanımda |
| FRM-020 | KVK Veri İhlal Kayıt ve Bildirim Formu | Form | Kullanımda (yer tutucu yok; alanlar elle doldurulur) |
| AYM-010 | Genel Aydınlatma Metni | Aydınlatma metni | Kullanımda |
| AYM-020 | Çalışan Aydınlatma Metni | Aydınlatma metni | Kullanımda |
| AYM-030 | Çalışan Adayı Aydınlatma Metni | Aydınlatma metni | **Kullanılmayacak** |
| AYM-040 | Kameralı Bölge Aydınlatma Metni | Aydınlatma metni | **Kullanılmayacak** |
| AYM-041 | Kameralı Bölge Aydınlatma Metni (Tabela) | Aydınlatma metni | Kullanımda |
| AYM-050 | Çerez Aydınlatma Metni | Aydınlatma metni | Kullanımda |
| SZL-010 | Çalışan Kişisel Verileri Koruma Gizlilik Protokolü | Sözleşme | Kullanımda |
| SZL-020 | Dış Kaynaklı Veri İşleyen Bilgi Güvenliği Sözleşmesi | Sözleşme | Kullanımda |
| TBL-010 | Kişisel Veri Envanteri Tablosu | Tablo (Excel) | Envanter modülünün veri yapısı için örnek |

## Notlar

- Politika, prosedür ve formların başlığında **Doküman No, Yayın Tarihi, Revizyon Tarihi, Revizyon No**
  alanları var. Karar (Erdal, 2026-10-06): yayın tarihi ve revizyon no sistem tarafından **otomatik
  doldurulmaz**; şablondaki haliyle kalır.
- TBL-010 (5 örnek satır, 16 sütun): Departman, Faaliyet, Veri Kategorisi, Kişisel Veri, Özel Nitelikli
  Kişisel Veri, İşleme Amacı, Fiziksel/Dijital, Bulunduğu Yer, Veri Konusu Kişi Grubu, Hukuki Sebep,
  İlgili Mevzuat, Saklama Süresi, Alıcı Grupları, Yurt Dışı Aktarım, İdari Tedbirler, Teknik Tedbirler.
  Tedbirler numaralı listeden seçiliyor; Kişisel Veri Envanteri modülü bu yapıyı esas alacak.
