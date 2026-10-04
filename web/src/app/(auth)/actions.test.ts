import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { updateHeaderAuthState } from './actions';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

const mockCookies = vi.mocked(cookies);
const mockGetCurrentUser = vi.mocked(getCurrentUser);

describe('updateHeaderAuthState', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('clears an invalid session cookie when the API reports no current user', async () => {
    const deleteCookie = vi.fn();
    mockCookies.mockResolvedValue({ delete: deleteCookie } as never);
    mockGetCurrentUser.mockResolvedValue(null);
    const formData = new FormData();
    formData.set('intent', 'load');

    await expect(updateHeaderAuthState({ status: 'loading' }, formData)).resolves.toEqual({
      status: 'signed-out',
    });
    expect(deleteCookie).toHaveBeenCalledWith('session');
  });

  it('ends all server sessions before clearing the browser cookie', async () => {
    const deleteCookie = vi.fn();
    mockCookies.mockResolvedValue({
      get: () => ({ value: 'active-session-token' }),
      delete: deleteCookie,
    } as never);
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.set('intent', 'logout-everywhere');

    await expect(
      updateHeaderAuthState({ status: 'signed-in', email: 'reader@example.com' }, formData),
    ).resolves.toEqual({ status: 'signed-out' });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/logout-all', 'http://localhost:4000'),
      expect.objectContaining({
        method: 'POST',
        headers: { cookie: 'session=active-session-token' },
        cache: 'no-store',
      }),
    );
    expect(deleteCookie).toHaveBeenCalledWith('session');
  });
});
