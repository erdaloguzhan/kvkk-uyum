'use client';

import { fieldLabel } from './labels';

/** API'den dönen hata. `body` API'nin hata gövdesidir (message, errors, missing...). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(errorMessageOf(body, status));
  }
}

export interface ApiErrorBody {
  message?: string | string[];
  errors?: { path?: string; row?: number; message: string; column?: string }[];
  missing?: string[];
}

let currentOrgId: string | null = null;

/** Kuruluş bağlamındaki isteklere eklenecek kuruluş (oturum sağlayıcısı ayarlar). */
export function setCurrentOrgId(id: string | null) {
  currentOrgId = id;
}

let refreshing: Promise<boolean> | null = null;

/** Aynı anda gelen 401'lerde oturum yalnızca bir kez yenilenir. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/session/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  /** Düz nesne JSON olarak, FormData olduğu gibi gönderilir. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** false: giriş gerektirmeyen uç nokta (oturum yenileme denenmez). */
  auth?: boolean;
  /** false: oturum yoksa giriş sayfasına yönlendirmez (ör. açılışta oturum kontrolü). */
  redirect?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = `/api/v1/${path.replace(/^\//, '')}`;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiFetch(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers = new Headers();
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(opts.body);
  }
  if (currentOrgId) headers.set('x-organization-id', currentOrgId);

  const send = () => fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && opts.auth !== false) {
      if (await refreshSession()) {
        res = await send();
      } else if (opts.redirect !== false) {
        redirectToLogin();
      }
    }
  } catch {
    throw new ApiError(0, { message: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' });
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(res.status, errBody);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Dosyayı indirir (ör. Word dokümanı, Excel envanter). */
export async function download(path: string, fallbackName: string) {
  const res = await apiFetch(path);
  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get('content-disposition')) ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileNameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain?.[1] ?? null;
}

export function redirectToLogin() {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/giris')) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/giris?sonra=${next}`;
}

function errorMessageOf(body: ApiErrorBody, status: number): string {
  const base = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  if (body.missing?.length) {
    return `${base ?? 'Eksik bilgi var'}: ${body.missing.map(fieldLabel).join(', ')}`;
  }
  if (base && base !== 'Geçersiz istek') return base;
  if (body.errors?.length) {
    return body.errors.map((e) => (e.path ? `${fieldLabel(e.path)}: ${e.message}` : e.message)).join(' · ');
  }
  if (base) return base;
  if (status === 403) return 'Bu işlem için yetkiniz yok';
  if (status === 404) return 'Kayıt bulunamadı';
  if (status === 429) return 'Çok fazla deneme yaptınız. Lütfen biraz bekleyin.';
  return 'Beklenmeyen bir hata oluştu';
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Beklenmeyen bir hata oluştu';
}
