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
 * Fiziksel/Dijital ve Bulunduğu yer giriş sayfasından kaldırıldı (Erdal, 14.11.2026); sütunlar TBL-010'da boş kalabilir.
 */
export const INVENTORY_REQUIRED_FIELDS: InventoryField[] = [
  'department',
  'activity',
  'dataCategory',
  'purposes',
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
  { name: 'Kimlik', examples: 'Ad soyad, Anne - baba adı, Anne kızlık soyadı, Doğum tarihi, Doğum yeri, Medeni hali, Nüfus cüzdanı seri sıra no, TC kimlik no', special: false },
  { name: 'İletişim', examples: 'Adres no, E-posta adresi, İletişim adresi, Kayıtlı elektronik posta adresi (KEP), Telefon no', special: false },
  { name: 'Lokasyon', examples: 'Bulunduğu yerin konum bilgileri', special: false },
  { name: 'Özlük', examples: 'Bordro bilgileri, Disiplin soruşturması, İşe giriş belgesi kayıtları, Mal bildirimi bilgileri, Özgeçmiş bilgileri, Performans değerlendirme raporları, Adli sicil kaydı', special: false },
  { name: 'Hukuki İşlem', examples: 'Adli makamlarla yazışmalardaki bilgiler, Dava dosyasındaki bilgiler', special: false },
  { name: 'Müşteri İşlem', examples: 'Çağrı merkezi kayıtları, Fatura, senet, çek bilgileri, Gişe dekontlarındaki bilgiler, Sipariş bilgisi, Talep bilgisi', special: false },
  { name: 'Fiziksel Mekân Güvenliği', examples: 'Çalışan ve ziyaretçilerin giriş çıkış kayıt bilgileri, Kamera kayıtları', special: false },
  { name: 'İşlem Güvenliği', examples: 'IP adresi bilgileri, İnternet sitesi giriş çıkış bilgileri, Şifre ve parola bilgileri', special: false },
  { name: 'Risk Yönetimi', examples: 'Ticari, teknik, idari risklerin yönetilmesi için işlenen bilgiler', special: false },
  { name: 'Finans', examples: 'Bilanço bilgileri, Finansal performans bilgileri, Kredi ve risk bilgileri, Malvarlığı bilgileri', special: false },
  { name: 'Mesleki Deneyim', examples: 'Diploma bilgileri, Gidilen kurslar, Meslek içi eğitim bilgileri, Sertifikalar, Transkript bilgileri', special: false },
  { name: 'Pazarlama', examples: 'Alışveriş geçmişi bilgileri, Anket, Çerez kayıtları, Kampanya çalışmasıyla elde edilen bilgiler', special: false },
  { name: 'Görsel ve İşitsel Kayıtlar', examples: 'Görsel ve işitsel kayıtlar', special: false },
  { name: 'Irk ve Etnik Köken', examples: 'Irk ve etnik kökeni bilgileri', special: true },
  { name: 'Siyasi Düşünce Bilgileri', examples: 'Siyasi düşüncesini belirten bilgiler, Siyasi parti üyeliği bilgisi', special: true },
  { name: 'Felsefi İnanç, Din, Mezhep ve Diğer İnançlar', examples: 'Diğer inançlarına ilişkin bilgiler, Dini aidiyetine ilişkin bilgiler, Felsefi inancına ilişkin bilgiler, Mezhep aidiyetine ilişkin bilgiler', special: true },
  { name: 'Kılık ve Kıyafet', examples: 'Kılık kıyafete ilişkin bilgiler', special: true },
  { name: 'Dernek Üyeliği', examples: 'Dernek üyeliği bilgileri', special: true },
  { name: 'Vakıf Üyeliği', examples: 'Vakıf üyeliği bilgileri', special: true },
  { name: 'Sendika Üyeliği', examples: 'Sendika üyeliği bilgileri', special: true },
  { name: 'Sağlık Bilgileri', examples: 'Engellilik durumuna ait bilgiler, Kan grubu bilgisi, Kişisel sağlık bilgileri, Kullanılan cihaz ve protez bilgileri', special: true },
  { name: 'Cinsel Hayat', examples: 'Cinsel hayata ilişkin bilgiler', special: true },
  { name: 'Ceza Mahkûmiyeti Ve Güvenlik Tedbirleri', examples: 'Ceza mahkumiyetine ilişkin bilgiler, Güvenlik tedbirlerine ilişkin bilgiler', special: true },
  { name: 'Biyometrik Veri', examples: 'Avuç içi bilgileri, Parmak izi bilgileri, Retina taraması bilgileri, Yüz tanıma bilgileri', special: true },
  { name: 'Genetik Veri', examples: 'Genetik veriler', special: true },
  { name: 'Diğer Bilgiler', examples: 'Kullanıcı tarafından belirlenecek veri türleri', special: true },
];

/**
 * Adım adım girişte önerilen seçenekler, aynen ve bu sırayla gösterilir. Veri kategorisi, işleme amacı, kişi
 * grubu, hukuki sebep, alıcı grubu ve tedbirler Erdal'ın verdiği listelerdir; diğerleri TBL-010'daki örnek satırlarda geçen değerlerdir.
 * Kuruluşun kendi girdiği diğer değerler listenin sonuna eklenerek önerilir.
 *
 * Not (28.10.2026): Güncel seçenekler artık veritabanındaki Kişisel Veri Envanteri (şablon) tablosundan gelir ve
 * admin panelinden düzenlenir. Bu liste yalnızca şablonun ilk içeriğidir (migration 0023) ve test verisinde kullanılır.
 */
export const INVENTORY_TEMPLATE_OPTIONS: Partial<Record<InventoryTextField | InventoryListField, string[]>> = {
  department: ['Genel', 'İdari', 'Muhasebe'],
  activity: ['Genel', 'Çalışan Özlük Dosyaları', 'Çalışan Sağlık Bilgileri'],
  dataCategory: DATA_CATEGORIES.map((c) => c.name),
  // Erdal'ın verdiği liste (2026-10-09), verdiği sırayla.
  purposes: [
    'Acil Durum Yönetimi Süreçlerinin Yürütülmesi',
    'Bilgi Güvenliği Süreçlerinin Yürütülmesi',
    'Çalışan Adayı / Stajyer / Öğrenci Seçme Ve Yerleştirme Süreçlerinin Yürütülmesi',
    'Çalışan Adaylarının Başvuru Süreçlerinin Yürütülmesi',
    'Çalışanlar İçin İş Akdi Ve Mevzuattan Kaynaklı Yükümlülüklerin Yerine Getirilmesi',
    'Çalışan Memnuniyeti Ve Bağlılığı Süreçlerinin Yürütülmesi',
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
  // Erdal'ın verdiği liste (Word dosyası, 2026-11-14), verdiği sırayla. "Diğer" serbest yazım alanıdır.
  dataSubjectGroups: [
    'Ürün veya Hizmet Alan Kişi',
    'Çalışan',
    'Çalışan Adayı',
    'Ziyaretçi',
    'Hissedar/Ortak',
    'Tedarikçi Çalışanı',
    'Tedarikçi Yetkilisi',
    'Potansiyel Ürün veya Hizmet Alıcısı',
    'Stajyer',
    'Sınav Adayı',
    'Habere konu kişi',
    'Veli/Vasi/Temsilci',
    'Denek',
  ],
  // Erdal'ın verdiği işleme şartları, verdiği sırayla; harfler kaldırıldı (Erdal, 14.11.2026).
  legalBases: [
    'Kanunlarda açıkça öngörülmesi.',
    'Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan veya rızasına hukuki geçerlilik tanınmayan kişinin kendisinin ya da bir başkasının hayatı veya beden bütünlüğünün korunması için zorunlu olması.',
    'Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.',
    'Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması.',
    'İlgili kişinin kendisi tarafından alenileştirilmiş olması.',
    'Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması.',
    'İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması.',
  ],
  relatedLegislation: [
    '6698 sayılı Kişisel Verilerin Korunması kanunu',
    '6331 sayılı İş Sağlığı ve Güvenliği kanunu',
    '4857 sayılı İş kanunu',
    '6102 sayılı Türk Ticaret kanunu',
    '5237 sayılı Türk Ceza kanunu',
  ],
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

/**
 * Veri envanteri giriş sayfasındaki sabit seçenekler (Erdal'ın "veri envanteri seçenekleri" Word dosyası, 14.11.2026).
 * Bu cümleler envanter satırına aynen yazılır; Excel dışa aktarımında da aynen görünür.
 */
export const NO_RECIPIENTS = 'Bu departman, süreç ve kategoride alıcı gruplarından hiç birine veri aktarılmamaktadır.';
export const NO_FOREIGN_TRANSFER = 'Bu departman, süreç ve veri kategorisinde yurtdışına veri aktarılmamaktadır.';
export const FOREIGN_TRANSFER = 'Bu departman, süreç ve veri kategoride yurtdışına veri aktarılmaktadır.';

/** Yurt dışına aktarım var mı: "aktarılmamaktadır" cümlesi ve boş değer aktarım yok sayılır. */
export function hasForeignTransfer(value: string | null | undefined): boolean {
  const v = value?.trim();
  return !!v && v !== NO_FOREIGN_TRANSFER;
}

/** Saklama süresi birimleri: süre "{rakam} {birim} {açıklama}" olarak tek metin halinde saklanır. */
export const RETENTION_UNITS = ['yıl', 'ay', 'gün'] as const;
export type RetentionUnit = (typeof RETENTION_UNITS)[number];

export interface RetentionParts {
  amount: string;
  unit: RetentionUnit;
  description: string;
}

/** "10 yıl işten ayrılıştan itibaren" → {10, yıl, işten ayrılıştan itibaren}. Kalıba uymayan eski metin açıklamaya gider. */
export function parseRetention(value: string | null | undefined): RetentionParts {
  const v = (value ?? '').trim();
  const m = /^(\d+)\s*(yıl|ay|gün)(?=\s|$)\s*([\s\S]*)$/i.exec(v);
  if (m) return { amount: m[1], unit: m[2].toLocaleLowerCase('tr-TR') as RetentionUnit, description: m[3].trim() };
  return { amount: '', unit: 'yıl', description: v };
}

export function formatRetention(p: RetentionParts): string {
  const amount = p.amount.trim();
  const description = p.description.trim();
  return [amount ? `${amount} ${p.unit}` : '', description].filter(Boolean).join(' ');
}

/** TBL-010 dosyasının content/ klasörüne göre yolu (Excel dışa aktarımında şablon olarak kullanılır). */
export const INVENTORY_TEMPLATE_FILE = 'tablolar/TBL-010 Kişisel Veri Envanteri Tablosu.xlsx';
