import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, apiUnavailable, forwardHeaders, setSessionCookies, TokenPair } from '@/lib/server/backend';

/**
 * Şifre değiştirme: API tüm açık oturumları kapatıp bu oturum için yeni belirteçler verir; belirteçler
 * çerezlere yazılır, böylece kullanıcı oturumda kalır.
 */
export async function POST(req: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: forwardHeaders(req, req.cookies.get(ACCESS_COOKIE)?.value),
      body: await req.text(),
    });
  } catch {
    return apiUnavailable();
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = new NextResponse(null, { status: 204 });
  setSessionCookies(req, res, data as TokenPair);
  return res;
}
