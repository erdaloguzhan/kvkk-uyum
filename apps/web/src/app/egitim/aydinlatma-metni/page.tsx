import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { PortalContent } from './content';

const TITLE = 'Çevrim İçi Eğitim Portalı Aydınlatma Metni';
/** portal-shell'deki PORTAL_BRAND ile aynı; o dosya istemci bileşeni olduğu için sabit buradan tekrar yazıldı. */
const BRAND = 'KVK Uyum Yönetim Sistemi Çalışan Paneli';

export const metadata: Metadata = { title: TITLE };

/** Yalnızca Eğitim Portalı giriş ekranından bağlantı verilir (Erdal, 04.11.2026). Kuruluş girişten önce bilinmediği için kurum bilgileri yerine genel ifade kullanılır. */
export default function Page() {
  return (
    <LegalPage title={TITLE} brand={BRAND} kind="portal">
      <PortalContent />
    </LegalPage>
  );
}
