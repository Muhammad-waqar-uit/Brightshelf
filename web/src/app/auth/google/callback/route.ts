import { timingSafeEqual } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeReturnPath } from '@/lib/returnPath';

const stateCookieName = 'google_oauth_state';
const nonceCookieName = 'google_oauth_nonce';
const verifierCookieName = 'google_oauth_verifier';
const returnToCookieName = 'google_oauth_return_to';
const callbackPath = '/auth/google/callback';
const tokenResponseSchema = z.object({ id_token: z.string().min(32) });

function redirectToSignIn(request: Request) {
  const response = NextResponse.redirect(new URL('/sign-in?error=google', request.url));
  clearOAuthCookies(response);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete({ name: stateCookieName, path: callbackPath });
  response.cookies.delete({ name: nonceCookieName, path: callbackPath });
  response.cookies.delete({ name: verifierCookieName, path: callbackPath });
  response.cookies.delete({ name: returnToCookieName, path: callbackPath });
}

function matchesState(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const stateCookie = request.cookies.get(stateCookieName)?.value;
  const nonce = request.cookies.get(nonceCookieName)?.value;
  const verifier = request.cookies.get(verifierCookieName)?.value;
  const returnTo = safeReturnPath(request.cookies.get(returnToCookieName)?.value);

  if (!matchesState(stateCookie, state) || !nonce || !verifier || !code) {
    return redirectToSignIn(request);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const apiUrl = process.env.API_URL;
  if (!clientId || !clientSecret || !redirectUri || !apiUrl) {
    return redirectToSignIn(request);
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });
    if (!tokenResponse.ok) {
      return redirectToSignIn(request);
    }

    const tokenResult = tokenResponseSchema.safeParse(await tokenResponse.json());
    if (!tokenResult.success) {
      return redirectToSignIn(request);
    }

    const exchangeResponse = await fetch(new URL('/api/auth/google/exchange', apiUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: tokenResult.data.id_token, nonce }),
      cache: 'no-store',
    });
    if (!exchangeResponse.ok) {
      return redirectToSignIn(request);
    }

    const setCookie = exchangeResponse.headers.get('set-cookie');
    const sessionToken = setCookie?.match(/(?:^|,\s*)session=([^;,\s]+)/)?.[1];
    if (!sessionToken) {
      return redirectToSignIn(request);
    }

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    clearOAuthCookies(response);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return redirectToSignIn(request);
  }
}
