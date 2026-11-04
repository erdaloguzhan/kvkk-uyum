import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { KullaniciContent } from './content';

const TITLE = 'KVK Uyum Yönetim Sistemi Kullanıcılarına Yönelik Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni';

export const metadata: Metadata = { title: TITLE };

export default function Page() {
  return (
    <LegalPage title={TITLE}>
      <KullaniciContent />
    </LegalPage>
  );
}
