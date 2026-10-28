# İlgili kişi başvuruları (FRM-010 / PRS-010)

Veri sahiplerinin KVKK md. 11 kapsamındaki başvuruları. Kaynak: `content/formlar/FRM-010 Veri Sahibi Başvuru Formu.docx`
ve `content/prosedurler/PRS-010 İlgili Kişi İşlemleri Prosedürü.docx`. Formdaki metinler
`packages/shared/src/data-subject-requests.ts` içindedir; web formu ve PDF aynı metni kullanır.

## Dışarıya açık form

- Her kuruluşun tahmin edilemez bir form adresi vardır: `https://<alan-adı>/basvuru/<kod>` (`organizations.request_form_key`).
- Kurum bu bağlantıyı web sitesine koyar veya panelde verilen `iframe` koduyla sayfasına gömer (`?gomulu=1` başlıksız gösterir).
  Yalnızca `/basvuru/*` sayfaları başka sitelerde çerçeve içinde açılabilir (`apps/web/next.config.ts`, `deploy/Caddyfile`).
- Dışarıya açık API yalnızca `GET/POST /api/v1/request-form/:kod`. Koruma: iş kanıtı CAPTCHA, IP başına 10 dakikada 5 gönderim,
  kuruluş başına 24 saatte en fazla 50 online başvuru, ekler PDF/JPEG/PNG (içerikten kontrol), en fazla 5 × 5 MB.
- Sorumlu formu kapatabilir veya adresini yenileyebilir (eski bağlantı çalışmaz olur).
- E-posta verildiyse başvurana alındı e-postası gider; e-postada başvuranın yazdığı hiçbir metin yer almaz.

## Süreç

1. Başvuru kaydedilir (online form veya Sorumlunun elden/noter/posta/KEP/e-posta ile gelen başvuruyu girmesi), kuruluş içinde
   sıralı numara alır (B-0001).
2. "İlgili kişi başvurusu" görevi açılır. Görev, Başvurular sayfasındaki "Yeni başvurular kime atansın" ayarında seçilen kişiye düşer;
   seçim yoksa önce KVKK Sorumlusu, yoksa Sorumlu + Yönetici rolündeki en eski üyeye. Açık başvurunun sorumlusu başvuru
   sayfasından değiştirilebilir (görev yeni kişiye geçer, işlem geçmişine yazılır).
3. Süreler başvurunun alındığı günden sayılır: kurum içi hedef 20 gün (görevin son tarihi), yasal son gün 30 gün (Kanun md. 13).
   Hedefe 7 ve 1 gün kala hatırlatma; hedef geçince yasal son güne kadar her gün, yasal süre de geçerse haftada bir uyarı.
4. "Ek bilgi bekleniyor" durumunda süre durur (FRM-010: bilgi ve belgeler tamamlanana kadar süre askıya alınır); bilgi gelince
   beklenen gün sayısı kadar iki tarih de ileri alınır.
5. Cevap kaydı: cevabın bildirildiği gün, sonuç (kabul / kısmen kabul / ret), bildirim yolu, açıklama ve isteğe bağlı cevap yazısı.
   Kaydedilince başvuru "Cevaplandı" olur, görev kapanır. Cevap bilgisi sonradan düzeltilebilir.
6. Başvuru FRM-010 düzeninde PDF olarak indirilebilir (cevap verilmişse sonuç bölümüyle).

## Yetkiler

- `requests.read`: liste, ayrıntı, PDF, rapor (KVKK Sorumlusu, Sorumlu + Yönetici, Yönetici).
- `requests.manage`: başvuru girme, durum, not, belge, cevap, form ayarları (KVKK Sorumlusu, Sorumlu + Yönetici).
- Ayrıntı ve dosya indirme işlem kayıtlarına yazılır (T.C. kimlik no açık gösterilir; veritabanında şifrelidir).

## Rapor

`/basvurular/rapor`: başvuru tarihine göre dönem; toplam/açık/cevaplanan, ortalama cevap süresi (ek bilgi beklenen günler hariç),
20 ve 30 gün içinde cevaplananlar, süresi geçenler; talep maddesi, durum, sonuç, ilişki ve başvuru yoluna göre dağılım; aylık tablo;
Excel'e aktarma.

## Canlıya alırken

Sunucuda kod güncellenip `docker compose -f docker-compose.prod.yml up -d --build` çalıştırıldıktan sonra Caddy yapılandırması
değiştiği için `docker compose -f docker-compose.prod.yml restart caddy` da çalıştırılmalı; aksi halde form başka sitelerde
çerçeve içinde açılmaz (bağlantı olarak açılması etkilenmez).
