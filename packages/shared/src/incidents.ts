/**
 * Veri ihlali olay yönetimi (PRS-030). Olay kaydının alanları FRM-020 "KVK Veri İhlal Kayıt ve Bildirim
 * Formu"nun (2026-11 güncel hali, 31 soru) sorularıyla birebir aynıdır; seçenek metinleri formdan alınmıştır.
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

/** 14) İhlalin kaynağı: sol sütun. "Diğer" seçeneği listededir; ayrıntı "Cevabınızı detaylı açıklayınız" (description) alanındadır. */
export const INCIDENT_SOURCES = [
  'Belge/cihaz hırsızlığı veya kaybolması',
  'Verilerin güvensiz ortamlarda depolanması',
  'Sabotaj',
  'Kaza/ İhmal',
  'Yetkisiz Erişim',
  'Diğer',
] as const;

/** 14) İhlalin kaynağı: sağ sütun (siber saldırılar). */
export const INCIDENT_CYBER_SOURCES = [
  'Siber saldırı (Henüz Bilinmiyor)',
  'Zararlı yazılımlar',
  'Sosyal mühendislik',
  'Hizmet dışı bırakma (DoS-DDoS)',
  'Fidye yazılımı (Ransomware)',
  'Parola saldırısı (Brute-Force Attack)',
  'Yazılım açıklığı',
  'Diğer',
] as const;

/** 15) İhlal etkisi */
export const INCIDENT_BREACH_EFFECTS = ['Veri gizliliği', 'Veri bütünlüğü', 'Veriye erişim/ulaşılabilirlik'] as const;

/** 17) İhlalden etkilenen kişisel veri kategorileri: Kişisel Veri */
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
  'Diğer',
] as const;

/** 17) İhlalden etkilenen kişisel veri kategorileri: Özel Nitelikli Kişisel Veri */
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

/** 19) İhlalden etkilenen ilgili kişi grupları */
export const INCIDENT_SUBJECT_GROUPS = [
  'Çalışanlar',
  'Kullanıcılar',
  'Aboneler/Üyeler',
  'Öğrenciler',
  'Müşteriler ve potansiyel müşteriler',
  'Hastalar',
  'Çocuklar',
  'Henüz bilinmiyor',
] as const;

/** 19) İlgili kişiler üzerindeki etkileri */
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

type Described = { label: string; description: string };

/** 27) İhlal sebebiyle ilgili kişilerin önemli olumsuz etkilere maruz kalma olasılığı */
export const INCIDENT_LIKELIHOODS = {
  very_high: {
    label: 'Çok Yüksek',
    description:
      'İlgili kişiler üstesinden gelemeyecekleri zorluklar ve geri döndürülemez sonuçlar ile karşılaşabilir (İşin durması, uzun süreli psikolojik veya fiziksel rahatsızlık, ölüm vb.)',
  },
  high: {
    label: 'Yüksek',
    description:
      'İlgili kişiler zorluklara rağmen üstesinden gelmeleri gereken ciddi sonuçlarla karşılaşabilirler.(Maddi zarar, iş kaybı, adli soruşturma, sağlığın kötüleşmesi vb.)',
  },
  medium: {
    label: 'Orta',
    description:
      'İlgili kişiler zorluklara rağmen üstesinden gelebilecekleri olumsuzluklarla karşılaşabilirler (Fazla efor, ek maliyet, stres, küçük fiziksel rahatsızlıklar vb.)',
  },
  low: {
    label: 'Düşük',
    description: 'İlgili kişiler üstesinden gelebilecekleri küçük olumsuzluklarla karşılaşabilirler (fazla zaman harcama, sıkıntı vb.)',
  },
  unknown: { label: 'Henüz bilinmiyor', description: '' },
} as const satisfies Record<string, Described>;

export type IncidentLikelihood = keyof typeof INCIDENT_LIKELIHOODS;

/** 28) İhlalin organizasyonunuza olan etkileri */
export const INCIDENT_ORG_IMPACTS = {
  very_high: { label: 'Çok Yüksek', description: 'Her türlü hizmet sunma yetisinin kaybedilmesi.' },
  high: { label: 'Yüksek', description: 'Önemli hizmetleri sunma yetisinin kaybedilmesi.' },
  medium: { label: 'Orta', description: 'Bazı hizmetlerin sunumunda kontrol kaybı ve eksikliğinin oluşması.' },
  low: { label: 'Düşük', description: 'Herhangi bir etkinlik ve kontrol kaybının olmaması' },
  unknown: { label: 'Bilinmiyor', description: '' },
} as const satisfies Record<string, Described>;

export type IncidentImpact = keyof typeof INCIDENT_ORG_IMPACTS;

/** 21) İlgili kişilere bildirim yapıldı mı? */
export const INCIDENT_SUBJECT_NOTICES = {
  yes: 'Evet, etkilenen ilgili kişilere bildirim yapıldı.',
  in_progress: 'İlgili kişilere bildirim çalışmaları devam etmektedir.',
  no: 'Hayır',
} as const;

export type IncidentSubjectNotice = keyof typeof INCIDENT_SUBJECT_NOTICES;

/**
 * FRM-020'nin A–D bölümlerindeki cevaplar (soru numaraları formdaki gibi). Bildirim türü, takip numarası ve
 * 10–12. sorulardaki tarihler kayıtta ayrı sütunlardır. Boş metin/seçim null veya boş liste olarak tutulur.
 */
export interface IncidentForm {
  // A) HAKKINIZDA
  /** 1 */ controllerName: string | null;
  /** 2 */ controllerAddress: string | null;
  /** 3 */ controllerWebsite: string | null;
  /** 4 */ controllerEmail: string | null;
  /** 5 */ controllerTaxId: string | null;
  /** 6 */ controllerKep: string | null;
  /** 7 */ controllerUets: string | null;
  /** 8 */ preparerName: string | null;
  preparerTitle: string | null;
  preparerEmail: string | null;
  preparerPhone: string | null;
  preparerAddress: string | null;
  // B) İHLAL HAKKINDA
  /** 13: ihlal veri işleyen tarafından bildirildiyse. Tarihler ISO tarih-saat. */
  processorName: string | null;
  processorAddress: string | null;
  processorDetectedAt: string | null;
  processorNotifiedAt: string | null;
  /** 14 */ sources: string[];
  cyberSources: string[];
  /** 14: "Cevabınızı detaylı bir şekilde açıklayınız" */
  description: string | null;
  /** 15 */ breachEffects: string[];
  breachEffectDetail: string | null;
  /** 16 */ detectionMethod: string | null;
  /** 17 */ personalCategories: string[];
  specialCategories: string[];
  categoryDetail: string | null;
  /** 18 */ estimatedPeople: number | null;
  estimatedRecords: number | null;
  countNote: string | null;
  /** 19 */ subjectGroups: string[];
  subjectGroupOther: string | null;
  subjectEffects: string[];
  subjectEffectOther: string | null;
  // C) BİLDİRİM
  /** 20 */ delayReason: string | null;
  /** 21 */ subjectNotice: IncidentSubjectNotice | null;
  subjectNoticeDetail: string | null;
  /** 22: YYYY-AA-GG */ subjectNoticeDate: string | null;
  /** 23 */ subjectNoticeMethod: string | null;
  /** 24 */ subjectContact: string | null;
  /** 25 */ domesticInformed: boolean | null;
  domesticDetail: string | null;
  /** 26 */ foreignInformed: boolean | null;
  foreignDetail: string | null;
  // Ç) OLASI SONUÇLAR
  /** 27 */ likelihood: IncidentLikelihood | null;
  /** 28 */ orgImpact: IncidentImpact | null;
  // D) ÖNLEMLER
  /** 29 */ staffTrainings: string | null;
  /** 30: tedbirler satır satır */ measuresBeforeTechnical: string | null;
  measuresBeforeAdministrative: string | null;
  measuresBefore: string | null;
  /** 31 */ measuresAfterTechnical: string | null;
  measuresAfterAdministrative: string | null;
  measuresAfter: string | null;
}

export const EMPTY_INCIDENT_FORM: IncidentForm = {
  controllerName: null,
  controllerAddress: null,
  controllerWebsite: null,
  controllerEmail: null,
  controllerTaxId: null,
  controllerKep: null,
  controllerUets: null,
  preparerName: null,
  preparerTitle: null,
  preparerEmail: null,
  preparerPhone: null,
  preparerAddress: null,
  processorName: null,
  processorAddress: null,
  processorDetectedAt: null,
  processorNotifiedAt: null,
  sources: [],
  cyberSources: [],
  description: null,
  breachEffects: [],
  breachEffectDetail: null,
  detectionMethod: null,
  personalCategories: [],
  specialCategories: [],
  categoryDetail: null,
  estimatedPeople: null,
  estimatedRecords: null,
  countNote: null,
  subjectGroups: [],
  subjectGroupOther: null,
  subjectEffects: [],
  subjectEffectOther: null,
  delayReason: null,
  subjectNotice: null,
  subjectNoticeDetail: null,
  subjectNoticeDate: null,
  subjectNoticeMethod: null,
  subjectContact: null,
  domesticInformed: null,
  domesticDetail: null,
  foreignInformed: null,
  foreignDetail: null,
  likelihood: null,
  orgImpact: null,
  staffTrainings: null,
  measuresBeforeTechnical: null,
  measuresBeforeAdministrative: null,
  measuresBefore: null,
  measuresAfterTechnical: null,
  measuresAfterAdministrative: null,
  measuresAfter: null,
};

/** Formlarda ve hata mesajlarında kullanılan alan adları (FRM-020'deki soru metinleri kısaltılarak). */
export const INCIDENT_FIELD_LABELS = {
  title: 'Olay başlığı',
  notificationType: 'Bildirim türü',
  followUpRef: 'Takip No',
  occurredAt: 'İhlalin başlama tarihi ve saati',
  endedAt: 'İhlalin sona erme tarihi ve saati',
  detectedAt: 'İhlalin tespit tarihi ve saati',
  controllerName: 'Veri sorumlusunun unvanı/ismi',
  controllerAddress: 'Veri sorumlusunun adresi',
  controllerWebsite: 'Veri sorumlusu internet adresi',
  controllerEmail: 'Veri sorumlusu e-posta adresi',
  controllerTaxId: 'Vergi Kimlik/T.C. Kimlik No',
  controllerKep: 'Veri Sorumlusu KEP Adresi',
  controllerUets: 'Veri Sorumlusu UETS Adresi',
  preparerName: 'Bildirimi hazırlayan kişinin Adı ve Soyadı',
  preparerTitle: 'Görevi/Unvanı',
  preparerEmail: 'E-postası',
  preparerPhone: 'Telefonu',
  preparerAddress: 'Adresi',
  processorName: 'Veri işleyenin unvanı/ ismi',
  processorAddress: 'Veri işleyenin adresi',
  processorDetectedAt: 'Veri işleyenin tespit tarihi ve saati',
  processorNotifiedAt: 'Veri işleyenin veri sorumlusuna bildirdiği tarih ve saat',
  sources: 'İhlalin kaynağı',
  cyberSources: 'İhlalin kaynağı (siber saldırı)',
  description: 'İhlalin kaynağı ve nasıl gerçekleştiği (detaylı açıklama)',
  breachEffects: 'İhlal etkisi',
  breachEffectDetail: 'İhlal etkisi açıklaması',
  detectionMethod: 'İhlalin nasıl tespit edildiği',
  personalCategories: 'Etkilenen kişisel veri kategorileri',
  specialCategories: 'Etkilenen özel nitelikli kişisel veri kategorileri',
  categoryDetail: 'Veri kategorileri açıklaması',
  estimatedPeople: 'Kişi Sayısı',
  estimatedRecords: 'Kişilere ait Kayıt Sayısı',
  countNote: 'Kesin sayıların tespit edilememe nedeni',
  subjectGroups: 'İlgili kişi grupları',
  subjectEffects: 'İlgili kişiler üzerindeki etkileri',
  delayReason: 'Geç bildirimin sebebi',
  subjectNotice: 'İlgili kişilere bildirim',
  subjectNoticeDetail: 'İlgili kişilere bildirim açıklaması',
  subjectNoticeDate: 'İlgili kişilere bildirim tarihi',
  subjectNoticeMethod: 'İlgili kişilere bildirim yöntemi',
  subjectContact: 'İlgili kişilerin bilgi alacağı iletişim yolları',
  domesticInformed: 'Yurtiçindeki kurumlara bilgi',
  foreignInformed: 'Yurtdışındaki otoritelere bilgi',
  likelihood: 'Olumsuz etkilere maruz kalma olasılığı',
  orgImpact: 'İhlalin organizasyona etkileri',
  staffTrainings: 'Çalışanların son bir yılda aldığı eğitimler',
  measuresBefore: 'İhlalden önce alınan tedbirler',
  measuresAfter: 'İhlal sonrası alınan/planlanan tedbirler',
} as const;
