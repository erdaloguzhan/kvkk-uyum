/**
 * Kuruluş profil alanları. Bu alanlar doküman şablonlarındaki yer tutuculara
 * (ör. {{kurum.unvan}}) otomatik yerleştirilir.
 */
export const ORGANIZATION_PLACEHOLDERS = {
  'kurum.unvan': 'name',
  'kurum.adres': 'address',
  'kurum.eposta': 'email',
  'kurum.telefon': 'phone',
  'kurum.kep': 'kepAddress',
  'kurum.yetkili': 'authorizedPerson',
} as const;

export type LicenseStatus = 'trial' | 'active' | 'expired';
