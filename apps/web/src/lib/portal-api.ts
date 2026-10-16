'use client';

import { ApiError, ApiErrorBody } from './api';

/** Eğitim Portalı istekleri (/api/portal → API /training-portal). */
export async function portalApi<T = unknown>(path: string, opts: { method?: string; body?: unknown; redirect?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/portal/${path.replace(/^\//, '')}`, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, { message: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody & { code?: string };
    if (opts.redirect !== false && typeof window !== 'undefined') {
      if (res.status === 401) {
        window.location.href = '/egitim';
      } else if (res.status === 403 && body.code === 'PASSWORD_CHANGE_REQUIRED') {
        window.location.href = '/egitim/sifre-degistir';
      }
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function portalLogout() {
  await fetch('/api/portal/logout', { method: 'POST' }).catch(() => undefined);
  window.location.href = '/egitim';
}
