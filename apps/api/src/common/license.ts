import { SetMetadata } from '@nestjs/common';

/**
 * Lisans süresi dolan kuruluşta ne olacağı (Erdal, 29.10.2026): kullanıcılar giriş yapıp kayıtlarını görebilir
 * ve indirebilir, ama yeni kayıt ekleyemez ve değiştiremez. Çalışan eğitim portalı ve herkese açık ilgili kişi
 * başvuru formu kuruluş oturumu kullanmadığı için etkilenmez.
 */
export const LICENSE_EXPIRED_MESSAGE =
  'Lisans süreniz doldu. Kayıtlarınızı görüntüleyip indirebilirsiniz; değişiklik yapmak için lisansınızı yenileyin.';

export function isLicenseExpired(org: { licenseStatus: string; licenseExpiresAt: Date | null }, now = new Date()) {
  return org.licenseStatus === 'expired' || (!!org.licenseExpiresAt && org.licenseExpiresAt < now);
}

export const ALLOW_EXPIRED_LICENSE = 'allowExpiredLicense';
/** Değişiklik sayılmayan POST uç noktaları (ör. bildirimi okundu yapmak) lisans süresi dolsa da çalışır. */
export const AllowExpiredLicense = () => SetMetadata(ALLOW_EXPIRED_LICENSE, true);
