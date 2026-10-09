'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText, RequestOptions } from './api';
import { useSession } from './session';

/** Sayfa verisini yükler; kuruluş değişince yeniden yükler. `path` null ise istek yapılmaz. */
export function useApi<T>(path: string | null, query?: RequestOptions['query']) {
  const { org } = useSession();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const queryKey = JSON.stringify(query ?? {});

  const load = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    try {
      setData(await api<T>(path, { query: JSON.parse(queryKey) }));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
    // org.id: kuruluş değişince yeniden yüklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey, org?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
