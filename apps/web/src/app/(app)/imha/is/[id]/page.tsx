'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorAlert, Loading } from '@/components/ui';
import type { DestructionItem } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Görevlerden gelen imha işi bağlantısını işin bulunduğu plana yönlendirir. */
export default function DestructionItemRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const item = useApi<DestructionItem>(`destruction/items/${id}`);
  useEffect(() => {
    if (item.data) router.replace(`/imha/${item.data.planId}`);
  }, [item.data, router]);
  return item.error ? <ErrorAlert error={item.error} /> : <Loading />;
}
