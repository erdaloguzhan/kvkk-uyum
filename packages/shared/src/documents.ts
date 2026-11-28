/**
 * Erdal'ın sağladığı KVKK doküman şablonlarının kataloğu (content/ klasörü).
 * Doküman Yönetimi modülü bu şablonları kuruluş profiliyle doldurup kuruluşa özel doküman oluşturur.
 * TBL-010 (Excel) burada yok (TBL-020 Word olduğu için form olarak listelenir); Kişisel Veri Envanteri modülünün veri yapısına esas alınır (inventory.ts).
 */
export const DOCUMENT_CATEGORIES = {
  policy: 'Politika',
  procedure: 'Prosedür',
  form: 'Form',
  notice: 'Aydınlatma metni',
  contract: 'Sözleşme',
} as const;

export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

export interface DocumentTemplateDefinition {
  code: string;
  title: string;
  category: DocumentCategory;
  /** content/ klasörüne göre dosya yolu. */
  file: string;
  /** Opsiyonel şablonlar kuruluş ihtiyacına göre seçilir; toplu kurulumda otomatik oluşturulmaz. */
  optional: boolean;
}

export const DOCUMENT_TEMPLATES: DocumentTemplateDefinition[] = [
  {
    code: 'POL-010',
    title: 'Kişisel Verilerin İşlenmesi, Korunması ve İmha Politikası',
    category: 'policy',
    file: 'politikalar/POL-010 Kişisel Verilerin İşlenmesi Korunması ve İmha Politikası.docx',
    optional: false,
  },
  {
    code: 'POL-020',
    title: 'Kişisel Verileri Saklama ve İmha Politikası',
    category: 'policy',
    file: 'politikalar/POL-020 Kişisel Verileri Saklama ve İmha Politikası.docx',
    optional: false,
  },
  {
    code: 'PRS-010',
    title: 'İlgili Kişi İşlemleri Prosedürü',
    category: 'procedure',
    file: 'prosedurler/PRS-010 İlgili Kişi İşlemleri Prosedürü.docx',
    optional: false,
  },
  {
    code: 'PRS-020',
    title: 'Veri Yedekleme Prosedürü',
    category: 'procedure',
    file: 'prosedurler/PRS-020 Veri Yedekleme Prosedürü.docx',
    optional: false,
  },
  {
    code: 'PRS-030',
    title: 'Veri İhlal Olay Yönetimi Prosedürü',
    category: 'procedure',
    file: 'prosedurler/PRS-030 Veri İhlal Olay Yönetimi Prosedürü.docx',
    optional: false,
  },
  {
    code: 'FRM-010',
    title: 'Veri Sahibi Başvuru Formu',
    category: 'form',
    file: 'formlar/FRM-010 Veri Sahibi Başvuru Formu.docx',
    optional: false,
  },
  {
    code: 'FRM-020',
    title: 'KVK Veri İhlal Kayıt ve Bildirim Formu',
    category: 'form',
    file: 'formlar/FRM-020 KVK Veri İhlal Kayıt ve Bildirim Formu.docx',
    optional: false,
  },
  {
    code: 'AYM-010',
    title: 'Genel Aydınlatma Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-010 Genel Aydınlatma Metni.docx',
    optional: false,
  },
  {
    code: 'AYM-020',
    title: 'Çalışan Aydınlatma Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-020 Çalışan Aydınlatma Metni.docx',
    optional: false,
  },
  {
    code: 'AYM-030',
    title: 'Çalışan Adayı Aydınlatma Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-030 Çalışan Adayı Aydınlatma Metni - Opsiyonel.docx',
    optional: true,
  },
  {
    code: 'AYM-040',
    title: 'Kameralı Bölge Aydınlatma Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-040 Kameralı Bölge Aydınlatma Metni - Opsiyonel.docx',
    optional: true,
  },
  {
    code: 'AYM-041',
    title: 'Kameralı Bölge Aydınlatma Metni (Tabela)',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-041 Kameralı Bölge Aydınlatma Metni - Tabela.docx',
    optional: false,
  },
  {
    code: 'AYM-050',
    title: 'Çerez Aydınlatma Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-050 Çerez Aydınlatma Metni.docx',
    optional: false,
  },
  {
    code: 'SZL-010',
    title: 'Çalışan Kişisel Verileri Koruma Gizlilik Protokolü',
    category: 'contract',
    file: 'sozlesmeler/SZL-010 Çalışan - Kişisel Verileri Koruma Gizlilik Protokolü.docx',
    optional: false,
  },
  {
    code: 'SZL-020',
    title: 'Dış Kaynaklı Veri İşleyen Bilgi Güvenliği Sözleşmesi',
    category: 'contract',
    file: 'sozlesmeler/SZL-020 Dış Kaynaklı Veri İşleyen Bilgi Güvenliği Sözleşmesi.docx',
    optional: false,
  },
  // Erdal'ın onayıyla eklenen şablonlar (2026-11-28).
  {
    code: 'POL-030',
    title: 'Özel Nitelikli Kişisel Veri Politikası',
    category: 'policy',
    file: 'politikalar/POL-030 Özel Nitelikli Kişisel Veri Politikası.docx',
    optional: false,
  },
  {
    code: 'PRS-040',
    title: 'Yurt Dışına Kişisel Veri Aktarımı Prosedürü',
    category: 'procedure',
    file: 'prosedurler/PRS-040 Yurt Dışına Kişisel Veri Aktarımı Prosedürü.docx',
    optional: false,
  },
  {
    code: 'FRM-030',
    title: 'İlgili Kişi Başvurusu Cevap Yazıları',
    category: 'form',
    file: 'formlar/FRM-030 İlgili Kişi Başvurusu Cevap Yazıları.docx',
    optional: false,
  },
  {
    code: 'FRM-040',
    title: 'Kişisel Veri İmha Tutanağı',
    category: 'form',
    file: 'formlar/FRM-040 Kişisel Veri İmha Tutanağı.docx',
    optional: false,
  },
  {
    code: 'FRM-050',
    title: 'Veri İhlali İlgili Kişi Bildirim Metinleri',
    category: 'form',
    file: 'formlar/FRM-050 Veri İhlali İlgili Kişi Bildirim Metinleri.docx',
    optional: false,
  },
  {
    code: 'FRM-060',
    title: 'VERBİS İrtibat Kişisi Atama Yazısı',
    category: 'form',
    file: 'formlar/FRM-060 VERBİS İrtibat Kişisi Atama Yazısı.docx',
    optional: true,
  },
  {
    code: 'AYM-060',
    title: 'Açık Rıza Metinleri',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-060 Açık Rıza Metinleri.docx',
    optional: true,
  },
  {
    code: 'AYM-070',
    title: 'İnternet Sitesi Gizlilik ve Çerez Paneli Metni',
    category: 'notice',
    file: 'aydinlatma-metinleri/AYM-070 İnternet Sitesi Gizlilik ve Çerez Paneli Metni.docx',
    optional: true,
  },
  {
    code: 'TBL-020',
    title: 'Teknik ve İdari Tedbirler Listesi',
    category: 'form',
    file: 'tablolar/TBL-020 Teknik ve İdari Tedbirler Listesi.docx',
    optional: false,
  },
];

/** Bir doküman sürümünün durumu: taslak → yayında → (yeni sürüm yayınlanınca) yürürlükten kalktı. */
export type DocumentVersionStatus = 'draft' | 'published' | 'superseded';
