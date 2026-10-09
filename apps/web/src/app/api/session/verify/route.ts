import { NextRequest, NextResponse } from 'next/server';
import { API_URL, apiUnavailable, forwardHeaders, setSessionCookies, TokenPair } from '@/lib/server/backend';

/** Girişin 2. adımı: doğrulama kodu API'de kontrol edilir, belirteçler çerezlere yazılır. */
export async function POST(req: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/auth/verify`, {
      method: 'POST',
      headers: forwardHeaders(req),
      body: await req.text(),
    });
  } catch {
    return apiUnavailable();
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const tokens = data as TokenPair & { user: unknown };
  const res = NextResponse.json({ user: tokens.user });
  setSessionCookies(req, res, tokens);
  return res;
}
