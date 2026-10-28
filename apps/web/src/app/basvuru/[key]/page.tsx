import type { Metadata } from 'next';
import { PublicRequestForm } from './public-request-form';

export const metadata: Metadata = { title: 'Kişisel Veri Başvuru Formu', robots: { index: false } };

/** Kuruluşun web sitesinden bağlantıyla açılan veya çerçeve (iframe) içinde gösterilen FRM-010 başvuru formu. */
export default async function PublicRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const { gomulu } = await searchParams;
  return <PublicRequestForm formKey={key} embedded={gomulu === '1'} />;
}
