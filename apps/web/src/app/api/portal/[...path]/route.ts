import { NextRequest, NextResponse } from 'next/server';
import { API_URL, apiPath, apiUnavailable, forwardHeaders, RESPONSE_HEADERS } from '@/lib/server/backend';

/**
 * Eğitim Portalı (katılımcı) için aracı. Portal oturumu yönetim/müşteri oturumundan ayrı bir httpOnly çerezde
 * tutulur; belirteç tarayıcıdaki JavaScript'e hiç verilmez.
 */
const PORTAL_COOKIE = 'kvkk_tr';
/** Yanıtında belirteç dönen uç noktalar: belirteç çereze yazılır, gövdeden çıkarılır. */
const TOKEN_PATHS = new Set(['login']);

function cookieOptions(req: NextRequest, maxAge: number) {
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge };
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = apiPath(path);
  if (joined === null) return NextResponse.json({ message: 'Bulunamadı' }, { status: 404 });

  if (joined === 'logout' && req.method === 'POST') {
    const res = new NextResponse(null, { status: 204 });
    res.cookies.set(PORTAL_COOKIE, '', cookieOptions(req, 0));
    return res;
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/training-portal/${joined}${req.nextUrl.search}`, {
      method: req.method,
      headers: forwardHeaders(req, req.cookies.get(PORTAL_COOKIE)?.value),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch {
    return apiUnavailable();
  }

  if (TOKEN_PATHS.has(joined) && upstream.ok) {
    const data = (await upstream.json()) as { token: string; expiresInSeconds: number; account: unknown };
    const res = NextResponse.json({ account: data.account });
    res.cookies.set(PORTAL_COOKIE, data.token, cookieOptions(req, data.expiresInSeconds));
    return res;
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const POST = proxy;
