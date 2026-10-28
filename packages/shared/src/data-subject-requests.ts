/**
 * İlgili kişi (veri sahibi) başvuruları: FRM-010 Veri Sahibi Başvuru Formu ve PRS-010 İlgili Kişi İşlemleri
 * Prosedürü. Formdaki metinler FRM-010'dan alınmıştır; web formu, PDF ve API aynı listeleri kullanır.
 */

/** Başvurunun alındığı günden itibaren kurum içi cevap hedefi (gün). Erdal'ın isteği, 28.10.2026. */
export const DSR_TARGET_DAYS = 20;
/** KVKK md. 13/2 ve PRS-010'daki yasal cevap süresi (gün). */
export const DSR_LEGAL_DAYS = 30;

export const DSR_FORM_CODE = 'FRM-010';
export const DSR_FORM_TITLE = 'Veri Sahibi Başvuru Formu';

/** FRM-010'un giriş metni (paragraflar). */
export const DSR_FORM_INTRO = [
  'Yapmış olduğunuz başvurunuzla ilgili başvuru sahibini tanımlayabilmemiz ve talebinizin niteliğine göre işyerimiz içerisinde gerekli araştırmaları yapabilmemiz ve tarafınıza cevap verebilmemiz için aşağıdaki bilgilerin sağlanması gerekmektedir.',
  'Aşağıda belirtilen iletişim bilgileriniz, sizlerden başvurunuzla ilgili daha detaylı bilgi almak, sizleri inceleme süreçlerimiz hakkında bilgilendirmek ve başvurunuzun sonuçlarını sizlere iletmek amacıyla talep edilmektedir.',
];

/** FRM-010'da veri sahibi bilgilerinden sonraki kimlik teyidi metni. */
export const DSR_FORM_VERIFICATION = [
  'Kişisel verilerinizin güvenliğini sağlamak amacıyla, bilgi edinme başvurunuzun işyerimize ulaştığı tarihten itibaren yedi (7) gün içinde, işyerimiz, veri sahibi olduğunuzu teyit etmek amacıyla sizinle iletişime geçebilecek, bu hususta sizlerden bazı bilgi ve belgeler talep edebilecektir.',
  'Talep edilen bilgi ve belgelerin eksik olması durumunda, talebimiz üzerine bilgi ve belgelerin tamamlanarak tarafımıza iletilmesi gerekecektir. Bilgi ve belgeler tarafımıza tam olarak iletilene kadar talebin sonuçlandırılmasına ilişkin Kanun’un 13/2 maddesinde belirtilen otuz (30) günlük süre askıya alınacaktır.',
];

/** FRM-010'un kapanış cümlesi; başvuru sahibi gönderirken bunu onaylar. */
export const DSR_FORM_CLOSING =
  'Yukarıda belirttiğim talepler doğrultusunda, İşyerinize yapmış olduğum başvurumun Kanun’un 13üncü maddesi uyarınca değerlendirilerek tarafıma bilgi verilmesini rica ederim.';

/** "İşyerimiz ile olan ilişkiniz". `detail` doluysa formda ek alan gösterilir. */
export const DSR_RELATIONSHIPS = {
  member: { label: 'Üye' },
  visitor: { label: 'Ziyaretçi' },
  former_employee: { label: 'Eski Çalışan', detail: 'Çalıştığınız yıllar' },
  job_applicant: { label: 'İş Başvurusu / Özgeçmiş Paylaşımı Yaptım', detail: 'Tarih' },
  customer: { label: 'Müşteri' },
  other: { label: 'Diğer', detail: 'Açıklayınız' },
} as const;

export type DsrRelationship = keyof typeof DSR_RELATIONSHIPS;

/** "Başvurunuza vereceğimiz yanıtın tarafınıza bildirilme yöntemi". */
export const DSR_RESPONSE_METHODS = {
  postal: { label: 'Adresime gönderilmesini istiyorum.' },
  email: {
    label: 'E-posta adresime gönderilmesini istiyorum.',
    note: 'E-posta yöntemini seçmeniz halinde size daha hızlı yanıt verebileceğiz.',
  },
  in_person: {
    label: 'Elden teslim almak istiyorum.',
    note: 'Vekâleten teslim alınması durumunda noter tasdikli vekâletname veya yetki belgesi olması gerekmektedir.',
  },
} as const;

export type DsrResponseMethod = keyof typeof DSR_RESPONSE_METHODS;

/** Panelde kısa gösterim. */
export const DSR_RESPONSE_METHOD_SHORT: Record<DsrResponseMethod, string> = {
  postal: 'Adrese posta',
  email: 'E-posta',
  in_person: 'Elden teslim',
};

export interface DsrRequestItemDefinition {
  no: number;
  /** Talep metni (FRM-010). */
  text: string;
  /** Kanun maddesi. */
  article?: string;
  /** "Seçiminiz" alanına yazılması istenen bilgi; varsa zorunlu açıklama alanı gösterilir. */
  detailLabel?: string;
  /** Açıklama alanının yanında gösterilen yönlendirme (hangi belgelerin ekleneceği). */
  detailHint?: string;
  /** a/b/c seçeneklerinden yalnızca biri seçilebilir. */
  options?: Record<'a' | 'b' | 'c', string>;
  /** Raporlarda kullanılan kısa ad. */
  short: string;
}

const ERASE_OPTIONS = {
  a: 'Silinmesini talep ediyorum.',
  b: 'Anonim hale getirilmesini talep ediyorum.',
  c: 'Yok edilmesini talep ediyorum.',
};

/** FRM-010'daki 10 talep maddesi. */
export const DSR_REQUEST_ITEMS: DsrRequestItemDefinition[] = [
  {
    no: 1,
    text: 'İşyerinizin hakkımda kişisel veri işleyip işlemediğini öğrenmek istiyorum.',
    short: 'Veri işlenip işlenmediğini öğrenme',
  },
  {
    no: 2,
    text: 'Eğer İşyeriniz hakkımda kişisel veri işliyorsa bu veri işleme faaliyetleri hakkında bilgi talep ediyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (b)',
    short: 'İşleme faaliyetleri hakkında bilgi',
  },
  {
    no: 3,
    text: 'Eğer İşyeriniz hakkımda kişisel veri işliyorsa bunların işlenme amacını ve işlenme amacına uygun kullanılıp kullanmadığını öğrenmek istiyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (c)',
    short: 'İşlenme amacını öğrenme',
  },
  {
    no: 4,
    text: 'Eğer kişisel verilerim yurtiçinde veya yurtdışında üçüncü kişilere aktarılıyorsa, bu üçüncü kişileri bilmek istiyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (ç)',
    short: 'Aktarılan üçüncü kişileri bilme',
  },
  {
    no: 5,
    text: 'Kişisel verilerimin eksik veya yanlış işlendiği düşünüyorum ve bunların düzeltilmesini istiyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (d)',
    detailLabel: 'Düzeltilecek veri',
    detailHint:
      'Düzeltilmesini istediğiniz kişisel verinizi yazınız ve doğru ve tamamlayıcı bilgilerini gösteren belgeleri ek olarak gönderiniz (Nüfus cüzdanı fotokopisi, ikametgâh gibi).',
    short: 'Düzeltme',
  },
  {
    no: 6,
    text: 'Kişisel verilerimin kanun ve ilgili diğer kanun hükümlerine uygun olarak işlenmiş olmasına rağmen, işlenmesini gerektiren sebeplerin ortadan kalktığını düşünüyorum ve bu çerçevede kişisel verilerimin;',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (e)',
    options: ERASE_OPTIONS,
    short: 'Silme / anonimleştirme / yok etme',
  },
  {
    no: 7,
    text: 'Eksik ve yanlış işlendiğini düşündüğüm kişisel verilerimin (Talep No 5) aktarıldığı üçüncü kişiler nezdinde de düzeltilmesini istiyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (f)',
    detailLabel: 'Düzeltilecek veri',
    detailHint:
      'Düzeltilmesini istediğiniz kişisel verinizi yazınız ve doğru ve tamamlayıcı bilgilerini gösteren belgeleri ek olarak gönderiniz (Nüfus cüzdanı fotokopisi, ikametgâh gibi).',
    short: 'Üçüncü kişilerde düzeltme',
  },
  {
    no: 8,
    text: 'Kişisel verilerimin kanun ve ilgili diğer kanun hükümlerine uygun olarak işlenmiş olmasına rağmen, işlenmesini gerektiren sebeplerin ortadan kalktığını düşünüyorum (Talep No 6) ve bu çerçevede kişisel verilerimin aktarıldığı üçüncü kişiler nezdinde de;',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (f)',
    options: ERASE_OPTIONS,
    short: 'Üçüncü kişilerde silme / anonimleştirme / yok etme',
  },
  {
    no: 9,
    text: 'İşyeriniz tarafından işlenen kişisel verilerimin münhasıran otomatik sistemler vasıtasıyla analiz edildiğini ve bu analiz neticesinde şahsım aleyhine bir sonuç doğduğunu düşünüyorum. Bu sonuca itiraz ediyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (g)',
    detailLabel: 'Analiz sonucu ortaya çıkan veri',
    detailHint: 'Aleyhinize olduğunu düşündüğünüz analiz sonucunu yazınız ve itirazınızı destekleyen belgeleri ek olarak gönderiniz.',
    short: 'Otomatik analiz sonucuna itiraz',
  },
  {
    no: 10,
    text: 'Kişisel verilerimin kanuna aykırı işlenmesi nedeniyle zarara uğradım. Bu zararın tazmini talep ediyorum.',
    article: 'Kişisel Verilerin Korunması Kanunu Mad 11/1 (h)',
    detailLabel: 'Kanuna aykırılığa konu olan husus',
    detailHint:
      'Kanuna aykırılığa konu olan hususu yazınız ve destekleyici belgeleri ek olarak gönderiniz (Mahkeme kararı, Kurul kararı, maddi zararın tutarını gösteren belgeler gibi).',
    short: 'Zararın tazmini',
  },
];

/** Formda işaretlenen talep. */
export interface DsrRequestItem {
  no: number;
  detail?: string | null;
  option?: 'a' | 'b' | 'c' | null;
}

/** Başvurunun kuruma ulaşma yolu (PRS-010: bizzat, noter, posta; ayrıca online form). */
export const DSR_CHANNELS = {
  web_form: 'Online başvuru formu',
  in_person: 'Bizzat (yazılı form)',
  notary: 'Noter',
  postal: 'Posta / kargo',
  kep: 'KEP',
  email: 'E-posta',
  other: 'Diğer',
} as const;

export type DsrChannel = keyof typeof DSR_CHANNELS;

/**
 * Yeni: henüz incelenmedi. Ek bilgi bekleniyor: kimlik teyidi veya eksik belge istendi; FRM-010'a göre
 * bu sürede cevap süresi işlemez. Cevaplandı: cevap kaydedildi, görev kapandı.
 */
export const DSR_STATUSES = {
  new: 'Yeni',
  in_review: 'İnceleniyor',
  awaiting_info: 'Ek bilgi bekleniyor',
  answered: 'Cevaplandı',
} as const;

export type DsrStatus = keyof typeof DSR_STATUSES;

/** PRS-010: veri sorumlusu başvuruyu kabul eder veya gerekçesini açıklayarak reddeder. */
export const DSR_OUTCOMES = {
  accepted: 'Kabul edildi',
  partially_accepted: 'Kısmen kabul edildi',
  rejected: 'Reddedildi',
} as const;

export type DsrOutcome = keyof typeof DSR_OUTCOMES;

/** Cevabın ilgili kişiye bildirilme yolu (PRS-010: yazılı veya elektronik ortamda). */
export const DSR_ANSWER_METHODS = {
  postal: 'Posta / kargo',
  email: 'E-posta',
  in_person: 'Elden teslim',
  kep: 'KEP',
  other: 'Diğer',
} as const;

export type DsrAnswerMethod = keyof typeof DSR_ANSWER_METHODS;

/** Başvuru geçmişindeki kayıt türleri. */
export const DSR_EVENT_KINDS = {
  received: 'Başvuru alındı',
  status_changed: 'Durum değişti',
  info_requested: 'Ek bilgi istendi (süre durdu)',
  info_received: 'Ek bilgi alındı (süre devam ediyor)',
  answered: 'Cevap kaydedildi',
  answer_updated: 'Cevap bilgisi güncellendi',
  note: 'Not',
  file_added: 'Dosya eklendi',
  reassigned: 'Sorumlu değişti',
} as const;

export type DsrEventKind = keyof typeof DSR_EVENT_KINDS;

/** Başvuru ekleri: kimlik ve destekleyici belgeler (PDF veya görsel). */
export const DSR_ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const DSR_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DSR_ATTACHMENT_MAX_FILES = 5;

/** Başvuru numarası gösterimi; numara kuruluş içinde sıralıdır: B-0001, B-0002... */
export const dsrNumber = (n: number) => `B-${String(n).padStart(4, '0')}`;
