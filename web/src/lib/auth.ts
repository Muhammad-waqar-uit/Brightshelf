import { cookies } from 'next/headers';
import { ApiError, apiFetch } from '@/lib/api';

export type AuthUser = {
  id: string;
  email: string;
};

type CurrentUserResponse = {
  user: AuthUser;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = (await cookies()).get('session')?.value;
  if (!session) {
    return null;
  }

  try {
    const response = await apiFetch<CurrentUserResponse>('/api/auth/me', {
      headers: { cookie: `session=${session}` },
      cache: 'no-store',
    });
    return response.user;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
