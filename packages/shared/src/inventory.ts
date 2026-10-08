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

/**
 * Adım adım girişte önerilen seçenekler: TBL-010'daki örnek satırlarda geçen değerler, aynen.
 * Liste eksiksiz değildir (ör. tedbir numaraları atlamalı); kuruluşun kendi girdiği değerler de önerilir.
 * Tedbirler TBL-010'daki numaralarıyla birlikte saklanır.
 */
export const INVENTORY_TEMPLATE_OPTIONS: Partial<Record<InventoryTextField | InventoryListField, string[]>> = {
  department: ['İdari', 'Muhasebe'],
  activity: ['Çalışan Özlük Dosyaları', 'Çalışan Sağlık Bilgileri'],
  dataCategory: ['Hukuki İşlem', 'İletişim', 'Kimlik', 'Özlük', 'Sağlık'],
  purposes: [
    'Çalışanlar İçin İş Akdi ve Mevzuat Kaynaklı Yükümlülüklerin Yerine Getirilmesi',
    'Çalışanlar İçin Yan Haklar ve Menfaatleri Süreçlerinin Yürütülmesi',
    'İnsan kaynakları süreçlerinin yürütülmesi',
  ],
  dataSubjectGroups: ['Çalışanlar', 'Stajyerler'],
  legalBases: [
    'Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.',
  ],
  relatedLegislation: ['4857 sayılı İş Kanunu', '5237 sayılı Türk Ceza kanunu'],
  retentionPeriod: ['15 yıl'],
  recipients: ['SGK Ve Diğer Yetkili Kurum ve Kuruluşlar', 'Mali Müşavir', 'Bankalar'],
  administrativeMeasures: [
    '7. Çalışanlar için veri güvenliği konusunda belli aralıklarla eğitim ve farkındalık çalışmaları yapılmaktadır.',
    '10. Erişim, bilgi güvenliği, kullanım, saklama ve imha konularında kurumsal politikalar hazırlanmış ve uygulamaya başlanmıştır.',
    '17. Kağıt yoluyla aktarılan kişisel veriler için ekstra güvenlik tedbirleri alınmakta ve ilgili evrak gizlilik dereceli belge formatında gönderilmektedir.',
    '18. Kişisel veri güvenliği politika ve prosedürleri belirlenmiştir.',
    '19. Kişisel veri güvenliği sorunları hızlı bir şekilde raporlanmaktadır.',
    '20. Kişisel veri güvenliğinin takibi yapılmaktadır.',
    '21. Kişisel veri içeren fiziksel ortamlara giriş çıkışlarla ilgili gerekli güvenlik önlemleri alınmaktadır.',
    '22. Kişisel veri içeren fiziksel ortamların dış risklere (yangın, sel vb.) karşı güvenliği sağlanmaktadır.',
    '23. Kişisel veri içeren ortamların güvenliği sağlanmaktadır.',
    '24. Kişisel veriler mümkün olduğunca azaltılmaktadır.',
    '29. Mevcut risk ve tehditler belirlenmiştir.',
  ],
  technicalMeasures: [
    '1. Ağ güvenliği ve uygulama güvenliği sağlanmaktadır.',
    '4. Bilgi teknolojileri sistemleri tedarik, geliştirme ve bakımı kapsamındaki güvenlik önlemleri alınmaktadır.',
    '10. Erişim, bilgi güvenliği, kullanım, saklama ve imha konularında kurumsal politikalar hazırlanmış ve uygulamaya başlanmıştır.',
    '14. Güncel anti-virüs sistemleri kullanılmaktadır.',
    '15. Güvenlik duvarları kullanılmaktadır.',
    '25. Kişisel veriler yedeklenmekte ve yedeklenen kişisel verilerin güvenliği de sağlanmaktadır.',
    '30. Özel nitelikli kişisel veri güvenliğine yönelik protokol ve prosedürler belirlenmiş ve uygulanmaktadır.',
  ],
};

/** TBL-010 dosyasının content/ klasörüne göre yolu (Excel dışa aktarımında şablon olarak kullanılır). */
export const INVENTORY_TEMPLATE_FILE = 'tablolar/TBL-010 Kişisel Veri Envanteri Tablosu.xlsx';
