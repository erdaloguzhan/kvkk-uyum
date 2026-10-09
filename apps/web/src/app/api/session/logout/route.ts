import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  API_URL,
  clearSessionCookies,
  forwardHeaders,
  REFRESH_COOKIE,
} from '@/lib/server/backend';

export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (accessToken && refreshToken) {
    const headers = forwardHeaders(req, accessToken);
    headers.set('content-type', 'application/json');
    // Çıkış API'de kayda geçmese bile çerezler silinir.
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(req, res);
  return res;
}
