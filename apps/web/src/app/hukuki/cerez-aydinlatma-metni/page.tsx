import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { CerezContent } from './content';

const TITLE = 'Çerez Aydınlatma Metni';

export const metadata: Metadata = { title: TITLE };

export default function Page() {
  return (
    <LegalPage title={TITLE}>
      <CerezContent />
    </LegalPage>
  );
}
