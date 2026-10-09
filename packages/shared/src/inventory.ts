/**
 * Kişisel Veri Envanteri. Yapı, Erdal'ın sağladığı TBL-010 Kişisel Veri Envanteri Tablosu'nun
 * 16 sütunuyla birebir aynıdır (content/tablolar/TBL-010 Kişisel Veri Envanteri Tablosu.xlsx).
 * Envanterin her satırı bir departmanın bir faaliyetinde işlenen bir veri kategorisidir.
 */

/** Fiziksel/Dijital sütununun değerleri. */
export const STORAGE_MEDIA = {
  physical: 'Fiziksel',
  digital: 'Dijital',
  both: 'Fiziksel ve Dijital',
} as const;

export type StorageMedium = keyof typeof STORAGE_MEDIA;

export type InventoryTextField =
  | 'department'
  | 'activity'
  | 'dataCategory'
  | 'personalData'
  | 'specialCategoryData'
  | 'storageLocation'
  | 'relatedLegislation'
  | 'retentionPeriod'
  | 'foreignTransfers';

export type InventoryListField =
  | 'purposes'
  | 'dataSubjectGroups'
  | 'legalBases'
  | 'recipients'
  | 'administrativeMeasures'
  | 'technicalMeasures';

export type InventoryField = InventoryTextField | InventoryListField | 'storageMedium';

export interface InventoryColumnDefinition {
  field: InventoryField;
  /** TBL-010'daki sütun başlığı. */
  label: string;
  /** TBL-010'daki üst başlık (sütun grubu). */
  group: string;
  /** list: birden çok değer seçilebilir; enum: STORAGE_MEDIA'dan biri. */
  kind: 'text' | 'list' | 'enum';
}

/** TBL-010 sütunları, tablodaki sırasıyla. */
export const INVENTORY_COLUMNS: InventoryColumnDefinition[] = [
  { field: 'department', label: 'Departman', group: 'ORGANİZASYON', kind: 'text' },
  { field: 'activity', label: 'Faaliyet', group: 'SÜREÇ', kind: 'text' },
  { field: 'dataCategory', label: 'Veri Kategorisi', group: 'KİŞİSEL VERİ', kind: 'text' },
  { field: 'personalData', label: 'Kişisel Veri', group: 'KİŞİSEL VERİ', kind: 'text' },
  { field: 'specialCategoryData', label: 'Özel Nitelikli Kişisel Veri', group: 'KİŞİSEL VERİ', kind: 'text' },
  { field: 'purposes', label: 'İşleme Amacı', group: 'KİŞİSEL VERİ', kind: 'list' },
  { field: 'storageMedium', label: 'Fiziksel/Dijital', group: 'KİŞİSEL VERİ', kind: 'enum' },
  { field: 'storageLocation', label: 'Bulunduğu yer', group: 'KİŞİSEL VERİ', kind: 'text' },
  { field: 'dataSubjectGroups', label: 'Veri Konusu Kişi Grubu', group: 'KİŞİSEL VERİ', kind: 'list' },
  { field: 'legalBases', label: 'Hukuki Sebebi', group: 'KİŞİSEL VERİ', kind: 'list' },
  { field: 'relatedLegislation', label: 'İlgili Mevzuat', group: 'KİŞİSEL VERİ', kind: 'text' },
  { field: 'retentionPeriod', label: 'Saklama Süresi', group: 'SAKLAMA ve İMHA', kind: 'text' },
  { field: 'recipients', label: 'Alıcı / Alıcı Grupları', group: 'AKTARMA', kind: 'list' },
  { field: 'foreignTransfers', label: 'Yabancı Ülkelere Aktarılan Veriler', group: 'AKTARMA', kind: 'text' },
  { field: 'administrativeMeasures', label: 'İdari Tedbirler', group: 'ALINAN GÜVENLİK TEDBİRLERİ', kind: 'list' },
  { field: 'technicalMeasures', label: 'Teknik Tedbirler', group: 'ALINAN GÜVENLİK TEDBİRLERİ', kind: 'list' },
];

/**
 * Bir envanter satırının tamamlanmış sayılması için dolu olması gereken alanlar.
 * Kişisel Veri ile Özel Nitelikli Kişisel Veri'den en az biri ayrıca aranır.
 * İlgili Mevzuat, alıcılar ve yurt dışı aktarım her faaliyette olmayabileceği için zorunlu değildir.
 */
export const INVENTORY_REQUIRED_FIELDS: InventoryField[] = [
  'department',
  'activity',
  'dataCategory',
  'purposes',
  'storageMedium',
  'storageLocation',
  'dataSubjectGroups',
  'legalBases',
  'retentionPeriod',
  'administrativeMeasures',
  'technicalMeasures',
];

export interface DataCategoryDefinition {
  name: string;
  /** Kategoriye giren verilere örnekler (Erdal'ın listesindeki parantez içi). */
  examples: string;
  /** Özel nitelikli kişisel veri kategorisi mi (KVKK md. 6). */
  special: boolean;
}

/**
 * Kişisel veri kategorileri: Erdal'ın verdiği iki liste (2026-10-09), verdiği sırayla.
 * İlk 13'ü kişisel veri, sonraki 13'ü özel nitelikli kişisel veri kategorisidir.
 */
export const DATA_CATEGORIES: DataCategoryDefinition[] = [
  { name: 'Kimlik', examples: 'ad soyad, anne - baba adı, anne kızlık soyadı, doğum tarihi, doğum yeri, medeni hali, nüfus cüzdanı seri sıra no, tc kimlik no gibi', special: false },
  { name: 'İletişim', examples: 'adres no, e-posta adresi, iletişim adresi, kayıtlı elektronik posta adresi (KEP), telefon no gibi', special: false },
  { name: 'Lokasyon', examples: 'bulunduğu yerin konum bilgileri', special: false },
  { name: 'Özlük', examples: 'bordro bilgileri, disiplin soruşturması, işe giriş-çıkış belgesi kayıtları, mal bildirimi bilgileri, özgeçmiş bilgileri, performans değerlendirme raporları gibi', special: false },
  { name: 'Hukuki İşlem', examples: 'adli makamlarla yazışmalardaki bilgiler, dava dosyasındaki bilgiler gibi', special: false },
  { name: 'Müşteri İşlem', examples: 'çağrı merkezi kayıtları, fatura, senet, çek bilgileri, gişe dekontlarındaki bilgiler, sipariş bilgisi, talep bilgisi gibi', special: false },
  { name: 'Fiziksel Mekân Güvenliği', examples: 'çalışan ve ziyaretçilerin giriş çıkış kayıt bilgileri, kamera kayıtları gibi', special: false },
  { name: 'İşlem Güvenliği', examples: 'IP adresi bilgileri, internet sitesi giriş çıkış bilgileri, şifre ve parola bilgileri gibi', special: false },
  { name: 'Risk Yönetimi', examples: 'ticari, teknik, idari risklerin yönetilmesi için işlenen bilgiler gibi', special: false },
  { name: 'Finans', examples: 'bilanço bilgileri, finansal performans bilgileri, kredi ve risk bilgileri, malvarlığı bilgileri gibi', special: false },
  { name: 'Mesleki Deneyim', examples: 'diploma bilgileri, gidilen kurslar, meslek içi eğitim bilgileri, sertifikalar, transkript bilgileri gibi', special: false },
  { name: 'Pazarlama', examples: 'alışveriş geçmişi bilgileri, anket, çerez kayıtları, kampanya çalışmasıyla elde edilen bilgiler', special: false },
  { name: 'Görsel ve İşitsel Kayıtlar', examples: 'görsel ve işitsel kayıtlar gibi', special: false },
  { name: 'Irk ve Etnik Köken', examples: 'ırk ve etnik kökeni bilgileri gibi', special: true },
  { name: 'Siyasi Düşünce Bilgileri', examples: 'siyasi düşüncesini belirten bilgiler, siyasi parti üyeliği bilgisi gibi', special: true },
  { name: 'Felsefi İnanç, Din, Mezhep ve Diğer İnançlar', examples: 'dini aidiyetine ilişkin bilgiler, felsefi inancına ilişkin bilgiler, mezhep aidiyetine ilişkin bilgiler, diğer inançlarına ilişkin bilgiler gibi', special: true },
  { name: 'Kılık ve Kıyafet', examples: 'kılık ve kıyafete ilişkin bilgiler', special: true },
  { name: 'Dernek Üyeliği', examples: 'dernek üyeliği bilgileri gibi', special: true },
  { name: 'Vakıf Üyeliği', examples: 'vakıf üyeliği bilgileri gibi', special: true },
  { name: 'Sendika Üyeliği', examples: 'sendika üyeliği bilgileri gibi', special: true },
  { name: 'Sağlık Bilgileri', examples: 'engellilik durumuna ait bilgiler, kan grubu bilgisi, kişisel sağlık bilgileri, kullanılan cihaz ve protez bilgileri gibi', special: true },
  { name: 'Cinsel Hayat', examples: 'cinsel hayata ilişkin bilgiler gibi', special: true },
  { name: 'Ceza Mahkûmiyeti Ve Güvenlik Tedbirleri', examples: 'ceza mahkûmiyetine ilişkin bilgiler, güvenlik tedbirlerine ilişkin bilgiler gibi', special: true },
  { name: 'Biyometrik Veri', examples: 'avuç içi bilgileri, parmak izi bilgileri, retina taraması bilgileri, yüz tanıma bilgileri gibi', special: true },
  { name: 'Genetik Veri', examples: 'genetik veriler gibi', special: true },
  { name: 'Diğer Bilgiler', examples: 'kullanıcı tarafından belirlenecek veri türleri gibi', special: true },
];

/**
 * Adım adım girişte önerilen seçenekler, aynen ve bu sırayla gösterilir. Veri kategorisi, işleme amacı, kişi
 * grubu, hukuki sebep, alıcı grubu ve tedbirler Erdal'ın verdiği listelerdir; diğerleri TBL-010'daki örnek satırlarda geçen değerlerdir.
 * Kuruluşun kendi girdiği diğer değerler listenin sonuna eklenerek önerilir.
 */
export const INVENTORY_TEMPLATE_OPTIONS: Partial<Record<InventoryTextField | InventoryListField, string[]>> = {
  department: ['İdari', 'Muhasebe'],
  activity: ['Çalışan Özlük Dosyaları', 'Çalışan Sağlık Bilgileri'],
  dataCategory: DATA_CATEGORIES.map((c) => c.name),
  // Erdal'ın verdiği liste (2026-10-09), verdiği sırayla.
  purposes: [
    'Acil Durum Yönetimi Süreçlerinin Yürütülmesi',
    'Bilgi Güvenliği Süreçlerinin Yürütülmesi',
    'Çalışan Adayı / Stajyer / Öğrenci Seçme Ve Yerleştirme Süreçlerinin Yürütülmesi',
    'Çalışan Adaylarının Başvuru Süreçlerinin Yürütülmesi',
    'Çalışan Memnuniyeti Ve Bağlılığı Süreçlerinin Yürütülmesi',
    'Çalışanlar İçin İş Akdi Ve Mevzuattan Kaynaklı Yükümlülüklerin Yerine Getirilmesi',
    'Çalışanlar İçin Yan Haklar Ve Menfaatleri Süreçlerinin Yürütülmesi',
    'Denetim / Etik Faaliyetlerinin Yürütülmesi',
    'Eğitim Faaliyetlerinin Yürütülmesi',
    'Erişim Yetkilerinin Yürütülmesi',
    'Faaliyetlerin Mevzuata Uygun Yürütülmesi',
    'Finans Ve Muhasebe İşlerinin Yürütülmesi',
    'Firma / Ürün / Hizmetlere Bağlılık Süreçlerinin Yürütülmesi',
    'Fiziksel Mekan Güvenliğinin Temini',
    'Görevlendirme Süreçlerinin Yürütülmesi',
    'Hukuk İşlerinin Takibi Ve Yürütülmesi',
    'İç Denetim/ Soruşturma / İstihbarat Faaliyetlerinin Yürütülmesi',
    'İletişim Faaliyetlerinin Yürütülmesi',
    'İnsan Kaynakları Süreçlerinin Planlanması',
    'İş Faaliyetlerinin Yürütülmesi / Denetimi',
    'İş Sağlığı / Güvenliği Faaliyetlerinin Yürütülmesi',
    'İş Süreçlerinin İyileştirilmesine Yönelik Önerilerin Alınması Ve Değerlendirilmesi',
    'İş Sürekliliğinin Sağlanması Faaliyetlerinin Yürütülmesi',
    'Lojistik Faaliyetlerinin Yürütülmesi',
    'Mal / Hizmet Satın Alım Süreçlerinin Yürütülmesi',
    'Mal / Hizmet Satış Sonrası Destek Hizmetlerinin Yürütülmesi',
    'Mal / Hizmet Satış Süreçlerinin Yürütülmesi',
    'Mal / Hizmet Üretim Ve Operasyon Süreçlerinin Yürütülmesi',
    'Müşteri İlişkileri Yönetimi Süreçlerinin Yürütülmesi',
    'Müşteri Memnuniyetine Yönelik Aktivitelerin Yürütülmesi',
    'Organizasyon Ve Etkinlik Yönetimi',
    'Pazarlama Analiz Çalışmalarının Yürütülmesi',
    'Performans Değerlendirme Süreçlerinin Yürütülmesi',
    'Reklam / Kampanya / Promosyon Süreçlerinin Yürütülmesi',
    'Risk Yönetimi Süreçlerinin Yürütülmesi',
    'Saklama Ve Arşiv Faaliyetlerinin Yürütülmesi',
    'Sosyal Sorumluluk Ve Sivil Toplum Aktivitelerinin Yürütülmesi',
    'Sözleşme Süreçlerinin Yürütülmesi',
    'Sponsorluk Faaliyetlerinin Yürütülmesi',
    'Stratejik Planlama Faaliyetlerinin Yürütülmesi',
    'Talep / Şikayetlerin Takibi',
    'Taşınır Mal Ve Kaynakların Güvenliğinin Temini',
    'Tedarik Zinciri Yönetimi Süreçlerinin Yürütülmesi',
    'Ücret Politikasının Yürütülmesi',
    'Ürün / Hizmetlerin Pazarlama Süreçlerinin Yürütülmesi',
    'Veri Sorumlusu Operasyonlarının Güvenliğinin Temini',
    'Yabancı Personel Çalışma Ve Oturma İzni İşlemleri',
    'Yatırım Süreçlerinin Yürütülmesi',
    'Yetenek / Kariyer Gelişimi Faaliyetlerinin Yürütülmesi',
    'Yetkili Kişi, Kurum Ve Kuruluşlara Bilgi Verilmesi',
    'Yönetim Faaliyetlerinin Yürütülmesi',
    'Ziyaretçi Kayıtlarının Oluşturulması Ve Takibi',
  ],
  // Erdal'ın verdiği liste (2026-10-09), verdiği sırayla.
  dataSubjectGroups: [
    'Çalışan Adayı',
    'Çalışan',
    'Denek',
    'Habere konu kişi',
    'Hissedar/Ortak',
    'Potansiyel Ürün veya Hizmet Alıcısı',
    'Sınav adayı',
    'Stajyer',
    'Tedarikçi Çalışanı',
    'Tedarikçi Yetkilisi',
    'Ürün veya Hizmet Alan Kişi',
    'Veli / Vasi / Temsilci',
    'Ziyaretçi',
    'Diğer',
  ],
  // Erdal'ın verdiği işleme şartları (2026-10-09), harfleriyle ve verdiği sırayla.
  legalBases: [
    'a) Kanunlarda açıkça öngörülmesi.',
    'b) Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan veya rızasına hukuki geçerlilik tanınmayan kişinin kendisinin ya da bir başkasının hayatı veya beden bütünlüğünün korunması için zorunlu olması.',
    'c) Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.',
    'ç) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması.',
    'd) İlgili kişinin kendisi tarafından alenileştirilmiş olması.',
    'e) Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması.',
    'f) İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması.',
  ],
  relatedLegislation: ['4857 sayılı İş Kanunu', '5237 sayılı Türk Ceza kanunu'],
  retentionPeriod: ['15 yıl'],
  // Erdal'ın verdiği liste (2026-10-09), verdiği sırayla.
  recipients: [
    'Gerçek kişiler veya özel hukuk tüzel kişileri',
    'Herkese açık',
    'Hissedarlar',
    'İş Ortakları',
    'İştirakler ve bağlı ortaklıklar',
    'Tedarikçiler',
    'Topluluk Şirketleri',
    'Yetkili Kamu Kurum ve Kuruluşları',
    'Diğer',
  ],
  // Erdal'ın verdiği idari tedbir listesi (2026-10-08), verdiği sırayla.
  administrativeMeasures: [
    'Kişisel Veri İşleme Envanteri Hazırlanması',
    'Kurumsal Politikalar (Erişim, Bilgi Güvenliği, Kullanım, Saklama ve İmha vb.)',
    'Sözleşmeler (Veri Sorumlusu - Veri Sorumlusu, Veri Sorumlusu - Veri İşleyen Arasında)',
    'Gizlilik Taahhütnameleri',
    'Kurum İçi Periyodik ve/veya Rastgele Denetimler',
    'Risk Analizleri',
    'İş Sözleşmesi, Disiplin Yönetmeliği (Kanuna Uygun Hükümler İlave Edilmesi)',
    'Kurumsal İletişim (Kriz Yönetimi, Kurul ve İlgili Kişiyi Bilgilendirme Süreçleri, İtibar Yönetimi vb.)',
    'Eğitim ve Farkındalık Faaliyetleri (Bilgi Güvenliği ve Kanun)',
    'Veri Sorumluları Sicil Bilgi Sistemine (VERBİS) Bildirim',
  ],
  // Erdal'ın verdiği teknik tedbir listesi (2026-10-08), verdiği sırayla.
  technicalMeasures: [
    'Yetki Matrisi',
    'Yetki Kontrol',
    'Erişim Logları',
    'Kullanıcı Hesap Yönetimi',
    'Ağ Güvenliği',
    'Uygulama Güvenliği',
    'Şifreleme',
    'Sızma Testi',
    'Saldırı Tespit ve Önleme Sistemleri',
    'Log Kayıtları',
    'Veri Maskeleme',
    'Veri Kaybı Önleme Yazılımları',
    'Yedekleme',
    'Güvenlik Duvarları',
    'Güncel Anti-Virüs Sistemleri',
    'Silme, Yok Etme veya Anonim Hale Getirme',
    'Anahtar Yönetimi',
  ],
};

/** TBL-010 dosyasının content/ klasörüne göre yolu (Excel dışa aktarımında şablon olarak kullanılır). */
export const INVENTORY_TEMPLATE_FILE = 'tablolar/TBL-010 Kişisel Veri Envanteri Tablosu.xlsx';
