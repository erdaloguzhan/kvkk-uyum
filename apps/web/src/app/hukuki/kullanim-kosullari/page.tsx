import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { KosullarContent } from './content';

const TITLE = 'KVK Uyum Yönetim Sistemi Hizmet Sözleşmesi ve Kullanım Koşulları';

export const metadata: Metadata = { title: TITLE };

export default function Page() {
  return (
    <LegalPage title={TITLE}>
      <KosullarContent />
    </LegalPage>
  );
}
