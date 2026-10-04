import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeReturnPath } from '@/lib/returnPath';

const stateCookieName = 'google_oauth_state';
const nonceCookieName = 'google_oauth_nonce';
const verifierCookieName = 'google_oauth_verifier';
const returnToCookieName = 'google_oauth_return_to';
const callbackPath = '/auth/google/callback';

export function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(new URL('/sign-in?error=google', request.url));
  }

  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('next'));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid email profile');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authorizationUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: callbackPath,
    maxAge: 10 * 60,
  };
  response.cookies.set(stateCookieName, state, cookieOptions);
  response.cookies.set(nonceCookieName, nonce, cookieOptions);
  response.cookies.set(verifierCookieName, verifier, cookieOptions);
  response.cookies.set(returnToCookieName, returnTo, cookieOptions);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
