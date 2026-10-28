/**
 * Veri ihlali olay yönetimi (PRS-030). Olay kaydının alanları FRM-020 "KVK Veri İhlal Kayıt ve Bildirim
 * Formu"ndaki sorularla birebir aynıdır; seçenek metinleri formdan alınmıştır.
 * Web, mobil ve API aynı listeleri kullanır.
 */

/** PRS-030: olası ihlaller tespitten itibaren 72 saat içinde KVK Kuruluna bildirilir. */
export const INCIDENT_NOTIFY_DEADLINE_HOURS = 72;

/** Son süreye bu kadar saat kala Sorumlu ve Yöneticiye uyarı gider. */
export const INCIDENT_DEADLINE_WARNING_HOURS = 24;

export const INCIDENT_STATUSES = {
  draft: 'Hazırlanıyor',
  pending_approval: 'Onay bekliyor',
  approved: 'Onaylandı, bildirilecek',
  notified: 'Kurula bildirildi',
  closed: 'Bildirim gerekmedi',
} as const;

export type IncidentStatus = keyof typeof INCIDENT_STATUSES;

/** Bildirimi henüz yapılmamış (72 saat takibi süren) durumlar. */
export const INCIDENT_OPEN_STATUSES: IncidentStatus[] = ['draft', 'pending_approval', 'approved'];

export const INCIDENT_NOTIFICATION_TYPES = {
  initial: 'İlk bildirim',
  follow_up: 'Takip bildirimi',
} as const;

export type IncidentNotificationType = keyof typeof INCIDENT_NOTIFICATION_TYPES;

/** B) İhlalin kaynağı */
export const INCIDENT_SOURCES = [
  'Kişisel verilerin yanlış alıcılara gönderilmesi',
  'Belge/cihaz hırsızlığı veya kaybolması',
  'Verilerin güvensiz ortamlarda depolanması',
  'Zararlı yazılımlar',
  'Sosyal mühendislik',
  'Sabotaj',
  'Kaza/ İhmal',
] as const;

/** B) İhlalden etkilenen kişisel veri kategorileri: Kişisel Veri */
export const INCIDENT_PERSONAL_DATA_CATEGORIES = [
  'Kimlik',
  'İletişim',
  'Lokasyon',
  'Özlük',
  'Hukuki İşlem',
  'Müşteri İşlem',
  'Fiziksel Mekan Güvenliği',
  'İşlem Güvenliği',
  'Risk Yönetimi',
  'Finans',
  'Mesleki Deneyim',
  'Pazarlama',
  'Görsel ve İşitsel Kayıtlar',
] as const;

/** B) İhlalden etkilenen kişisel veri kategorileri: Özel Nitelikli Kişisel Veri */
export const INCIDENT_SPECIAL_DATA_CATEGORIES = [
  'Irk ve Etnik Köken',
  'Siyasi Düşünce',
  'Felsefi İnanç, Din, Mezhep ve Diğer İnançlar',
  'Kılık ve Kıyafet',
  'Dernek Üyeliği',
  'Vakıf Üyeliği',
  'Sendika Üyeliği',
  'Sağlık Bilgileri',
  'Cinsel Hayat',
  'Ceza Mahkumiyeti ve Güvenlik Tedbirleri',
  'Biyometrik Veri',
  'Genetik Veri',
] as const;

/** B) İhlalden etkilenen ilgili kişi grupları */
export const INCIDENT_SUBJECT_GROUPS = [
  'Çalışanlar',
  'Kullanıcılar',
  'Aboneler/Üyeler',
  'Öğrenciler',
  'Müşteriler ve potansiyel Müşteriler',
  'Hastalar',
  'Çocuklar',
  'Korunmaya muhtaç yetişkinler',
  'Henüz bilinmiyor',
] as const;

/** B) İlgili kişiler üzerindeki etkileri */
export const INCIDENT_SUBJECT_EFFECTS = [
  'Kişisel veriler üzerinde kontrol kaybı',
  'Kimlik hırsızlığı',
  'Ayrımcılık',
  'Hakların kısıtlanması',
  'Dolandırıcılık',
  'Finansal kayıp',
  'İtibar kaybı',
  'Kişisel verilerin güvenliği kaybı',
] as const;

/** C) İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı */
export const INCIDENT_LIKELIHOODS = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
  unknown: 'Daha bilinmiyor',
} as const;

export type IncidentLikelihood = keyof typeof INCIDENT_LIKELIHOODS;

/** C) İhlalin organizasyonunuza olan etkileri */
export const INCIDENT_ORG_IMPACTS = {
  high: { label: 'Yüksek', description: 'Tüm kullanıcılarınıza her türlü önemli hizmeti sunma yetinizi kaybettiniz.' },
  medium: { label: 'Orta', description: 'Bazı kullanıcılarınıza önemli bir hizmeti sunma yetinizi kaybettiniz.' },
  low: {
    label: 'Düşük',
    description:
      'Herhangi bir etkinlik kaybı söz konusu değil ya da çok düşük bir etkinlik kaybı var ve tüm kullanıcılarınıza tüm önemli hizmetleri sunabiliyorsunuz.',
  },
  unknown: { label: 'Bilinmiyor', description: '' },
} as const;

/** D) Siber saldırıların organizasyonunuza olan etkileri */
export const INCIDENT_CYBER_IMPACTS = {
  high: {
    label: 'Yüksek',
    description: 'Tüm kullanıcılarınıza bilgi sistemleri aracılığıyla vermiş olduğunuz hizmetleri sunma yetinizi kaybettiniz.',
  },
  medium: {
    label: 'Orta',
    description: 'Bazı kullanıcılarınıza bilgi sistemleri aracılığıyla vermiş olduğunuz hizmetleri sunma yetinizi kaybettiniz.',
  },
  low: {
    label: 'Düşük',
    description:
      'Herhangi bir etkinlik kaybı söz konusu değil ya da çok düşük bir etkinlik kaybı var ve tüm kullanıcılarınıza bilgi sistemleri aracılığıyla vermiş olduğunuz hizmetleri sunabiliyorsunuz.',
  },
  unknown: { label: 'Bilinmiyor', description: '' },
} as const;

export type IncidentImpact = keyof typeof INCIDENT_ORG_IMPACTS;

/** C) İyileşme zamanı ile ilgili bilgiler */
export const INCIDENT_RECOVERIES = {
  normal: { label: 'Normal', description: 'Var olan kaynaklarınızı kullanacaksınız ve iyileşme zamanınızı öngörebiliyorsunuz.' },
  supported: { label: 'Destekli', description: 'Ek kaynaklar kullanacaksınız ve iyileşme zamanınızı öngörebiliyorsunuz.' },
  extended: { label: 'Uzatılmış', description: 'Ek kaynaklara ihtiyacınız var ve iyileşme zamanınızı öngöremiyorsunuz' },
  irreversible: { label: 'Geri Dönülmez', description: 'Saldırıdan geri dönüş imkansız (örn. yedekler yok edilmiş)' },
  complete: { label: 'Tamamlanmış', description: 'İyileşme tamamlandı' },
} as const;

/** D) Siber saldırıda iyileşme zamanı (FRM-020'de "bilişim kaynakları" ifadesiyle). */
export const INCIDENT_CYBER_RECOVERIES = {
  normal: INCIDENT_RECOVERIES.normal,
  supported: { label: 'Destekli', description: 'Ek bilişim kaynakları kullanacaksınız ve iyileşme zamanınızı öngörebiliyorsunuz.' },
  extended: { label: 'Uzatılmış', description: 'Ek bilişim kaynaklarına ihtiyacınız var ve iyileşme zamanınızı öngöremiyorsunuz' },
  irreversible: INCIDENT_RECOVERIES.irreversible,
  complete: INCIDENT_RECOVERIES.complete,
} as const;

export type IncidentRecovery = keyof typeof INCIDENT_RECOVERIES;

/** D) Siber saldırı sonucu gerçekleşen ihlal unsuru */
export const INCIDENT_CYBER_ELEMENTS = ['Veri gizliliği', 'Veri bütünlüğü', 'Veriye erişim'] as const;

/** E) İlgili kişilere ihlal bildirimi yapıldı mı? */
export const INCIDENT_SUBJECT_NOTICES = {
  yes: 'Evet, etkilenen ilgili kişilere bildirim yapıldı',
  in_progress: 'İlgili kişilere bildirim yapılmak üzere veya halihazırda bildirimi gerçekleştiriyoruz',
  no_already_aware: 'Hayır, zaten bilgileri var',
  no_will_notify: 'Hayır, ancak bildirilecek',
  other: 'Diğer (Aşağıda detayları belirtiniz)',
} as const;

export type IncidentSubjectNotice = keyof typeof INCIDENT_SUBJECT_NOTICES;

/** FRM-020'nin A–E bölümlerindeki cevaplar. Boş metin/seçim null veya boş liste olarak tutulur. */
export interface IncidentForm {
  // A) HAKKINIZDA
  controllerName: string | null;
  controllerAddress: string | null;
  preparerName: string | null;
  preparerTitle: string | null;
  preparerEmail: string | null;
  preparerPhone: string | null;
  // B) İHLAL HAKKINDA
  description: string | null;
  sources: string[];
  sourceOther: string | null;
  personalCategories: string[];
  specialCategories: string[];
  categoryOther: string | null;
  estimatedPeople: number | null;
  estimatedRecords: number | null;
  subjectGroups: string[];
  subjectGroupOther: string | null;
  subjectEffects: string[];
  subjectEffectOther: string | null;
  delayReason: string | null;
  // C) OLASI SONUÇLAR
  potentialEffects: string | null;
  likelihood: IncidentLikelihood | null;
  likelihoodDetail: string | null;
  orgImpact: IncidentImpact | null;
  orgRecovery: IncidentRecovery | null;
  // D) VARSA SİBER SALDIRIYA ÖZGÜ SONUÇLAR
  cyberAttack: boolean | null;
  cyberElements: string[];
  cyberElementOther: string | null;
  cyberImpact: IncidentImpact | null;
  cyberRecovery: IncidentRecovery | null;
  // E) ÖNLEMLER
  staffTrained: boolean | null;
  measuresBefore: string | null;
  measuresAfter: string | null;
  recurrenceSteps: string | null;
  subjectNotice: IncidentSubjectNotice | null;
  subjectNoticeMethod: string | null;
  subjectContact: string | null;
  domesticInformed: boolean | null;
  domesticDetail: string | null;
  foreignInformed: boolean | null;
  foreignDetail: string | null;
}

export const EMPTY_INCIDENT_FORM: IncidentForm = {
  controllerName: null,
  controllerAddress: null,
  preparerName: null,
  preparerTitle: null,
  preparerEmail: null,
  preparerPhone: null,
  description: null,
  sources: [],
  sourceOther: null,
  personalCategories: [],
  specialCategories: [],
  categoryOther: null,
  estimatedPeople: null,
  estimatedRecords: null,
  subjectGroups: [],
  subjectGroupOther: null,
  subjectEffects: [],
  subjectEffectOther: null,
  delayReason: null,
  potentialEffects: null,
  likelihood: null,
  likelihoodDetail: null,
  orgImpact: null,
  orgRecovery: null,
  cyberAttack: null,
  cyberElements: [],
  cyberElementOther: null,
  cyberImpact: null,
  cyberRecovery: null,
  staffTrained: null,
  measuresBefore: null,
  measuresAfter: null,
  recurrenceSteps: null,
  subjectNotice: null,
  subjectNoticeMethod: null,
  subjectContact: null,
  domesticInformed: null,
  domesticDetail: null,
  foreignInformed: null,
  foreignDetail: null,
};

/** Formlarda ve hata mesajlarında kullanılan alan adları (FRM-020'deki soru metinleri kısaltılarak). */
export const INCIDENT_FIELD_LABELS = {
  title: 'Olay başlığı',
  notificationType: 'Bildirim türü',
  followUpRef: 'Takip numarası',
  occurredAt: 'İhlalin gerçekleşme tarihi ve saati',
  detectedAt: 'İhlalin tespit tarihi ve saati',
  controllerName: 'Veri sorumlusunun unvanı/ ismi',
  controllerAddress: 'Veri sorumlusunun adresi',
  preparerName: 'Bu bildirimi hazırlayan kişinin Adı ve Soyadı',
  preparerTitle: 'Görevi',
  preparerEmail: 'E-postası',
  preparerPhone: 'Telefonu',
  description: 'İhlal hakkında bilgi',
  sources: 'İhlalin kaynağı',
  personalCategories: 'Etkilenen kişisel veri kategorileri',
  specialCategories: 'Etkilenen özel nitelikli kişisel veri kategorileri',
  estimatedPeople: 'Tahmini kişi sayısı',
  estimatedRecords: 'Tahmini kayıt sayısı',
  subjectGroups: 'İlgili kişi grupları',
  subjectEffects: 'İlgili kişiler üzerindeki etkileri',
  delayReason: 'Gecikme sebebi',
  potentialEffects: 'İhlalin potansiyel etkileri',
  likelihood: 'Olumsuz etkilere maruz kalma olasılığı',
  orgImpact: 'İhlalin organizasyona etkileri',
  orgRecovery: 'İyileşme zamanı',
  cyberAttack: 'Siber saldırıdan etkilenme',
  cyberElements: 'Siber saldırı sonucu ihlal unsuru',
  cyberImpact: 'Siber saldırının organizasyona etkileri',
  cyberRecovery: 'Siber saldırıda iyileşme zamanı',
  staffTrained: 'Çalışanların son bir yılda eğitim alması',
  measuresBefore: 'İhlalden önce alınan tedbirler',
  measuresAfter: 'İhlalin sonucu alınan/planlanan tedbirler',
  recurrenceSteps: 'Tekrarlanmaması için atılan adımlar',
  subjectNotice: 'İlgili kişilere bildirim',
  subjectNoticeMethod: 'İlgili kişilere bildirim yöntemi',
  subjectContact: 'Bilgi alınacak kişi / web adresi',
  domesticInformed: 'Yurtiçindeki kurumlara bilgi',
  foreignInformed: 'Yurtdışındaki otoritelere bilgi',
} as const;
