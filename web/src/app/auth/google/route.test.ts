import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Google OAuth start route', () => {
  it('redirects to Google with the web callback URI and PKCE protection', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/auth/google/callback');
    vi.stubEnv('NODE_ENV', 'development');

    const response = GET(new Request('http://localhost:3000/auth/google?next=%2Forders'));
    const location = new URL(response.headers.get('location') ?? '');

    expect(response.status).toBe(307);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/google/callback',
    );
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('nonce')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(response.headers.get('set-cookie')).toContain('Path=/auth/google/callback');
  });

  it('returns to sign in when Google OAuth is not configured', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const response = GET(new Request('http://localhost:3000/auth/google'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in?error=google');
  });
});
