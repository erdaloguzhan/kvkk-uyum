import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, apiPath, apiUnavailable, forwardHeaders, RESPONSE_HEADERS } from '@/lib/server/backend';

/** Belirteç döndüren veya alan uç noktalar yalnızca /api/session üzerinden kullanılır. */
const SESSION_PATHS = new Set(['auth/verify', 'auth/refresh', 'auth/logout', 'auth/change-password']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = apiPath(path);
  if (joined === null || SESSION_PATHS.has(joined)) return NextResponse.json({ message: 'Bulunamadı' }, { status: 404 });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/${joined}${req.nextUrl.search}`, {
      method: req.method,
      headers: forwardHeaders(req, req.cookies.get(ACCESS_COOKIE)?.value),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch {
    return apiUnavailable();
  }
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'no-store');
  return new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
