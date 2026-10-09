import { NextRequest, NextResponse } from 'next/server';
import {
  API_URL,
  apiUnavailable,
  clearSessionCookies,
  forwardHeaders,
  REFRESH_COOKIE,
  setSessionCookies,
  TokenPair,
} from '@/lib/server/backend';

/** Erişim belirtecinin süresi dolunca yenileme belirteciyle yenisi alınır. */
export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ message: 'Oturum yok' }, { status: 401 });

  const headers = forwardHeaders(req);
  headers.set('content-type', 'application/json');
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return apiUnavailable();
  }
  if (!upstream.ok) {
    const res = NextResponse.json({ message: 'Oturum süresi doldu, tekrar giriş yapın' }, { status: 401 });
    clearSessionCookies(req, res);
    return res;
  }
  const res = new NextResponse(null, { status: 204 });
  setSessionCookies(req, res, (await upstream.json()) as TokenPair);
  return res;
}
