import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { BasvuruContent } from './content';

const TITLE = 'Kişisel Veri Sahibi Başvuru Formu';

export const metadata: Metadata = { title: TITLE };

export default function Page() {
  return (
    <LegalPage title={TITLE}>
      <BasvuruContent />
      <p className="legal-download">
        <a className="btn btn-primary" href="/hukuki/ilgili-kisi-basvuru-formu.docx" download>
          Formu Word olarak indir
        </a>
      </p>
    </LegalPage>
  );
}
