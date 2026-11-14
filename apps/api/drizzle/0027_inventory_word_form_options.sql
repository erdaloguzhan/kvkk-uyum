-- Kişisel Veri Envanteri (şablon) seçenekleri, Erdal'ın "veri envanteri seçenekleri" Word dosyasına göre (14.11.2026).
-- Yalnızca şablon seçenekleri değişir; mevcut envanter satırlarındaki değerler olduğu gibi kalır.

-- Departman ve faaliyet: "Genel" ilk öneri olur.
INSERT INTO "inventory_template_options" ("field", "value", "sort_order") VALUES
('department', 'Genel', 0),
('activity', 'Genel', 0)
ON CONFLICT ("field", "value") DO NOTHING;
--> statement-breakpoint

-- Veri kategorisi örnekleri: giriş sayfasında kategorinin veri alanında silinen yer tutucu olarak görünür.
UPDATE "inventory_template_options" AS o SET "examples" = v.examples, "updated_at" = now()
FROM (VALUES
('Kimlik', 'Ad soyad, Anne - baba adı, Anne kızlık soyadı, Doğum tarihi, Doğum yeri, Medeni hali, Nüfus cüzdanı seri sıra no, TC kimlik no'),
('İletişim', 'Adres no, E-posta adresi, İletişim adresi, Kayıtlı elektronik posta adresi (KEP), Telefon no'),
('Lokasyon', 'Bulunduğu yerin konum bilgileri'),
('Özlük', 'Bordro bilgileri, Disiplin soruşturması, İşe giriş belgesi kayıtları, Mal bildirimi bilgileri, Özgeçmiş bilgileri, Performans değerlendirme raporları, Adli sicil kaydı'),
('Hukuki İşlem', 'Adli makamlarla yazışmalardaki bilgiler, Dava dosyasındaki bilgiler'),
('Müşteri İşlem', 'Çağrı merkezi kayıtları, Fatura, senet, çek bilgileri, Gişe dekontlarındaki bilgiler, Sipariş bilgisi, Talep bilgisi'),
('Fiziksel Mekân Güvenliği', 'Çalışan ve ziyaretçilerin giriş çıkış kayıt bilgileri, Kamera kayıtları'),
('İşlem Güvenliği', 'IP adresi bilgileri, İnternet sitesi giriş çıkış bilgileri, Şifre ve parola bilgileri'),
('Risk Yönetimi', 'Ticari, teknik, idari risklerin yönetilmesi için işlenen bilgiler'),
('Finans', 'Bilanço bilgileri, Finansal performans bilgileri, Kredi ve risk bilgileri, Malvarlığı bilgileri'),
('Mesleki Deneyim', 'Diploma bilgileri, Gidilen kurslar, Meslek içi eğitim bilgileri, Sertifikalar, Transkript bilgileri'),
('Pazarlama', 'Alışveriş geçmişi bilgileri, Anket, Çerez kayıtları, Kampanya çalışmasıyla elde edilen bilgiler'),
('Görsel ve İşitsel Kayıtlar', 'Görsel ve işitsel kayıtlar'),
('Irk ve Etnik Köken', 'Irk ve etnik kökeni bilgileri'),
('Siyasi Düşünce Bilgileri', 'Siyasi düşüncesini belirten bilgiler, Siyasi parti üyeliği bilgisi'),
('Felsefi İnanç, Din, Mezhep ve Diğer İnançlar', 'Diğer inançlarına ilişkin bilgiler, Dini aidiyetine ilişkin bilgiler, Felsefi inancına ilişkin bilgiler, Mezhep aidiyetine ilişkin bilgiler'),
('Kılık ve Kıyafet', 'Kılık kıyafete ilişkin bilgiler'),
('Dernek Üyeliği', 'Dernek üyeliği bilgileri'),
('Vakıf Üyeliği', 'Vakıf üyeliği bilgileri'),
('Sendika Üyeliği', 'Sendika üyeliği bilgileri'),
('Sağlık Bilgileri', 'Engellilik durumuna ait bilgiler, Kan grubu bilgisi, Kişisel sağlık bilgileri, Kullanılan cihaz ve protez bilgileri'),
('Cinsel Hayat', 'Cinsel hayata ilişkin bilgiler'),
('Ceza Mahkûmiyeti Ve Güvenlik Tedbirleri', 'Ceza mahkumiyetine ilişkin bilgiler, Güvenlik tedbirlerine ilişkin bilgiler'),
('Biyometrik Veri', 'Avuç içi bilgileri, Parmak izi bilgileri, Retina taraması bilgileri, Yüz tanıma bilgileri'),
('Genetik Veri', 'Genetik veriler'),
('Diğer Bilgiler', 'Kullanıcı tarafından belirlenecek veri türleri')
) AS v(value, examples)
WHERE o."field" = 'dataCategory' AND o."value" = v.value;
--> statement-breakpoint

-- İşleme amacı: Word dosyasındaki sıra.
UPDATE "inventory_template_options" SET "sort_order" = 5 WHERE "field" = 'purposes' AND "value" = 'Çalışanlar İçin İş Akdi Ve Mevzuattan Kaynaklı Yükümlülüklerin Yerine Getirilmesi';
--> statement-breakpoint
UPDATE "inventory_template_options" SET "sort_order" = 6 WHERE "field" = 'purposes' AND "value" = 'Çalışan Memnuniyeti Ve Bağlılığı Süreçlerinin Yürütülmesi';
--> statement-breakpoint
UPDATE "inventory_template_options" SET "sort_order" = 7 WHERE "field" = 'purposes' AND "value" = 'Çalışanlar İçin Yan Haklar Ve Menfaatleri Süreçlerinin Yürütülmesi';
--> statement-breakpoint

-- Veri konusu kişi grupları: Word dosyasındaki yazım ve sıra.
UPDATE "inventory_template_options" SET "value" = 'Sınav Adayı'
WHERE "field" = 'dataSubjectGroups' AND "value" = 'Sınav adayı'
  AND NOT EXISTS (SELECT 1 FROM "inventory_template_options" WHERE "field" = 'dataSubjectGroups' AND "value" = 'Sınav Adayı');
--> statement-breakpoint
UPDATE "inventory_template_options" SET "value" = 'Veli/Vasi/Temsilci'
WHERE "field" = 'dataSubjectGroups' AND "value" = 'Veli / Vasi / Temsilci'
  AND NOT EXISTS (SELECT 1 FROM "inventory_template_options" WHERE "field" = 'dataSubjectGroups' AND "value" = 'Veli/Vasi/Temsilci');
--> statement-breakpoint
UPDATE "inventory_template_options" AS o SET "sort_order" = v.ord
FROM (VALUES
('Ürün veya Hizmet Alan Kişi', 1),
('Çalışan', 2),
('Çalışan Adayı', 3),
('Ziyaretçi', 4),
('Hissedar/Ortak', 5),
('Tedarikçi Çalışanı', 6),
('Tedarikçi Yetkilisi', 7),
('Potansiyel Ürün veya Hizmet Alıcısı', 8),
('Stajyer', 9),
('Sınav Adayı', 10),
('Habere konu kişi', 11),
('Veli/Vasi/Temsilci', 12),
('Denek', 13)
) AS v(value, ord)
WHERE o."field" = 'dataSubjectGroups' AND o."value" = v.value;
--> statement-breakpoint

-- "Diğer" artık her listenin sonunda serbest yazım alanıdır; ayrı bir seçenek olarak tutulmaz.
DELETE FROM "inventory_template_options" WHERE "field" IN ('dataSubjectGroups', 'recipients', 'purposes') AND "value" = 'Diğer';
--> statement-breakpoint

-- İlgili mevzuat: hazır seçenekler (çoklu seçim, listede olmayan eklenebilir).
DELETE FROM "inventory_template_options" WHERE "field" = 'relatedLegislation' AND "value" IN ('4857 sayılı İş Kanunu', '5237 sayılı Türk Ceza kanunu');
--> statement-breakpoint
INSERT INTO "inventory_template_options" ("field", "value", "sort_order") VALUES
('relatedLegislation', '6698 sayılı Kişisel Verilerin Korunması kanunu', 1),
('relatedLegislation', '6331 sayılı İş Sağlığı ve Güvenliği kanunu', 2),
('relatedLegislation', '4857 sayılı İş kanunu', 3),
('relatedLegislation', '6102 sayılı Türk Ticaret kanunu', 4),
('relatedLegislation', '5237 sayılı Türk Ceza kanunu', 5)
ON CONFLICT ("field", "value") DO NOTHING;
