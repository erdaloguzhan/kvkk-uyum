# Destek talepleri

Kuruluş kullanıcıları müşteri ekranındaki **Destek** menüsünden talep açar; talepler yönetim panelindeki
**Destek talepleri** kutusuna düşer ve platform yöneticileri yanıtlar. Tüm yazışma ve ekler sistemde saklanır.

## Akış

| Durum | Anlamı | Nasıl olur |
| --- | --- | --- |
| Açık | Destek ekibinin yanıtını bekliyor | Talep açılınca, kullanıcı yanıt yazınca (kapalı talep de yeniden açılır) |
| Yanıtlandı | Kullanıcının dönüşünü bekliyor | Destek ekibi yanıt yazınca |
| Kapandı | İş bitti | Kullanıcı "Talebi kapat", destek ekibi "Talebi kapat" veya "Yanıtla ve kapat" |

- Kuruluşun her aktif üyesi talep açabilir. Kullanıcı kendi taleplerini, kuruluş yöneticisi (`org.manage`)
  kuruluşun tüm taleplerini görür.
- Sorumlu yalnızca platform yöneticisi olabilir. Sorumlusu olmayan talebi ilk yanıtlayan kişi sorumlu olur.
- İlk yanıt zamanı (`first_response_at`) saklanır; listede "İlk yanıt süresi" olarak görünür.
- Ekler: PNG, JPEG, WEBP, GIF veya PDF; mesaj başına en fazla 5 dosya, her biri 5 MB. Dosya türü uzantıya
  değil içeriğin ilk baytlarına bakılarak kontrol edilir. Ekran görüntüsü mesaj kutusuna yapıştırılabilir.
- Sistem logu: `support.ticket_created`, `support.ticket_assigned`, `support.ticket_status_changed`.

## E-postalar

E-postalarda yazışmanın içeriği gönderilmez (kişisel veri içerebilir); yalnızca talep numarası, konu ve
bağlantı gider.

- Yeni talep ve kullanıcı yanıtı: talebin sorumlusuna; sorumlu yoksa tüm platform yöneticilerine.
- Destek ekibi yanıtı ve kapatma: talebi açan kullanıcıya.
- Sorumlu atama: atanan kişiye (kendini atadıysa gitmez).

## Sonraki adımlar (kapsam dışı)

- Sık sorulan sorular (SSS) sayfası.
- WhatsApp veya telefon numarası.
