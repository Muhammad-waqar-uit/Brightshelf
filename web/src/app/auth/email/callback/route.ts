import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeReturnPath } from '@/lib/returnPath';

// Keep this callback outside /api so Vercel routes it to the web service.
const querySchema = z.object({
  token: z.string().min(32).max(128),
  next: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  const apiUrl = process.env.API_URL;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    token: url.searchParams.get('token'),
    next: url.searchParams.get('next') ?? undefined,
  });
  if (!parsed.success || !apiUrl) {
    return redirectToSignIn(request);
  }

  try {
    const response = await fetch(new URL('/api/auth/verify-link', apiUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
    if (!response.ok) {
      return redirectToSignIn(request);
    }

    const setCookie = response.headers.get('set-cookie');
    const sessionToken = setCookie?.match(/(?:^|,\s*)session=([^;,\s]+)/)?.[1];
    if (!sessionToken) {
      return redirectToSignIn(request);
    }

    const redirect = NextResponse.redirect(new URL(safeReturnPath(parsed.data.next), request.url));
    redirect.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    redirect.headers.set('Cache-Control', 'no-store');
    redirect.headers.set('Referrer-Policy', 'no-referrer');
    return redirect;
  } catch {
    return redirectToSignIn(request);
  }
}

function redirectToSignIn(request: Request) {
  const response = NextResponse.redirect(new URL('/sign-in?error=link', request.url));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
