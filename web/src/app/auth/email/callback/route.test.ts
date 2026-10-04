import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('email sign-in callback route', () => {
  it('exchanges a valid link for the web session cookie', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'set-cookie': 'session=valid-session-token; Path=/; HttpOnly; SameSite=Lax' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request(
        `http://localhost:3000/auth/email/callback?token=${'a'.repeat(32)}&next=%2Forders`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:4000/api/auth/verify-link'),
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/orders');
    expect(response.headers.get('set-cookie')).toContain('session=valid-session-token');
  });

  it('rejects an invalid email link without contacting the API', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request('http://localhost:3000/auth/email/callback?token=short'),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in?error=link');
  });
});
