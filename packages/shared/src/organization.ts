/**
 * Doküman şablonlarındaki yer tutucular ve karşılık gelen kuruluş profil alanları.
 * Adlar, sağlanan KVKK dokümanlarında kullanılanlarla aynıdır (ör. {{kurum.unvan}}).
 * Şablonlarda `{{ kurum.unvan }}` gibi boşluklu yazım da geçerlidir.
 */
export const ORGANIZATION_PLACEHOLDERS = {
  'kurum.unvan': 'name',
  'kurum.adresi': 'address',
  'kurum.vergi_no': 'taxNumber',
  'kurum.web_sitesi_adresi': 'website',
  'kurum.eposta': 'email',
  'kurum.telefon': 'phone',
  'kurum.kep': 'kepAddress',
  'kurum.yetkili': 'authorizedPerson',
} as const;

/**
 * Kuruluş profilinde zorunlu olmayan alanların yer tutucuları. Boşsa doküman yine oluşturulur,
 * yer tutucu boş bırakılır.
 */
export const OPTIONAL_PLACEHOLDERS: string[] = ['kurum.kep', 'kurum.web_sitesi_adresi'];

export type LicenseStatus = 'trial' | 'active' | 'expired';
