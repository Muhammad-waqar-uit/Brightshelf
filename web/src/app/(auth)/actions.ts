'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ApiError, apiFetch } from '@/lib/api';
import { safeReturnPath } from '@/lib/returnPath';

export type AuthFormState = {
  step: 'email' | 'code' | 'link-sent';
  method: 'code' | 'link';
  email?: string;
  developmentCode?: string;
  developmentLink?: string;
  message?: string;
  error?: boolean;
};

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((email) => email.toLowerCase());
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the six-digit code.');

type ChallengeResponse = {
  ok: true;
  code?: string;
  link?: string;
};

type VerifyResponse = {
  user: {
    id: string;
    email: string;
  };
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

function getApiUrl(): string {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error('API_URL is not configured');
  }

  return apiUrl;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return 'That code is invalid or has expired. Request a new code and try again.';
  }
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many attempts. Wait a few minutes before trying again.';
  }
  return 'We could not complete sign-in. Please try again.';
}

export async function submitAuthForm(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const step = formData.get('step');
  const method = formData.get('method') === 'link' ? 'link' : 'code';
  const returnTo = safeReturnPath(formData.get('returnTo'));
  const emailResult = emailSchema.safeParse(formData.get('email'));

  if (!emailResult.success) {
    return {
      step: step === 'code' ? 'code' : step === 'link-sent' ? 'link-sent' : 'email',
      method,
      message: 'Enter a valid email address.',
      error: true,
    };
  }

  const email = emailResult.data;

  if (step !== 'code') {
    try {
      const result = await apiFetch<ChallengeResponse>('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, method, returnTo }),
        cache: 'no-store',
      });

      if (method === 'link') {
        return {
          step: 'link-sent',
          method,
          email,
          developmentLink: result.link,
          message: result.link
            ? 'Email delivery is not configured. Use this development-only sign-in link.'
            : 'If this email can receive a sign-in link, it will arrive shortly.',
        };
      }

      return {
        step: 'code',
        method,
        email,
        developmentCode: result.code,
        message: result.code
          ? 'Email delivery is not configured. Use this development-only code to continue.'
          : 'If this email can receive a sign-in code, it will arrive shortly.',
      };
    } catch (error: unknown) {
      return {
        step: 'email',
        method,
        email,
        message: getErrorMessage(error),
        error: true,
      };
    }
  }

  const codeResult = codeSchema.safeParse(formData.get('code'));
  if (!codeResult.success) {
    return {
      step: 'code',
      method,
      email,
      message: codeResult.error.issues[0]?.message ?? 'Enter the six-digit code.',
      error: true,
    };
  }

  try {
    const response = await fetch(new URL('/api/auth/verify', getApiUrl()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: codeResult.data }),
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorBody: ApiErrorResponse = {};
      try {
        errorBody = (await response.json()) as ApiErrorResponse;
      } catch {
        return {
          step: 'code',
          method,
          email,
          message: 'The sign-in service returned an invalid response. Try again.',
          error: true,
        };
      }
      return {
        step: 'code',
        method,
        email,
        message: errorBody.error?.message ?? getErrorMessage(new ApiError(response.status)),
        error: true,
      };
    }

    const result = (await response.json()) as VerifyResponse;
    if (!result.user?.id || !result.user.email) {
      return {
        step: 'code',
        method,
        email,
        message: 'The sign-in service returned an invalid response. Try again.',
        error: true,
      };
    }

    const setCookie = response.headers.get('set-cookie');
    const sessionToken = setCookie?.match(/(?:^|,\s*)session=([^;,\s]+)/)?.[1];
    if (!sessionToken) {
      return {
        step: 'code',
        method,
        email,
        message: 'Sign-in could not establish a secure session. Please try again.',
        error: true,
      };
    }

    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
  } catch (error: unknown) {
    return {
      step: 'code',
      method,
      email,
      message: getErrorMessage(error),
      error: true,
    };
  }

  redirect(returnTo);
}

export type HeaderAuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; email: string; message?: string }
  | { status: 'error'; message?: string };

export async function updateHeaderAuthState(
  previousState: HeaderAuthState,
  formData: FormData,
): Promise<HeaderAuthState> {
  const intent = formData.get('intent');
  if (intent === 'logout' || intent === 'logout-everywhere') {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    const endpoint = intent === 'logout-everywhere' ? '/api/auth/logout-all' : '/api/auth/logout';
    const failureMessage =
      intent === 'logout-everywhere'
        ? 'We could not sign you out everywhere. Please try again.'
        : 'We could not sign you out. Please try again.';

    if (session) {
      try {
        const response = await fetch(new URL(endpoint, getApiUrl()), {
          method: 'POST',
          headers: { cookie: `session=${session}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          return previousState.status === 'signed-in'
            ? { ...previousState, message: failureMessage }
            : { status: 'error', message: failureMessage };
        }
      } catch {
        const message =
          intent === 'logout-everywhere'
            ? 'We could not reach the sign-in service to end all sessions.'
            : 'We could not reach the sign-in service. Please try again.';
        return previousState.status === 'signed-in'
          ? { ...previousState, message }
          : { status: 'error', message };
      }
    }

    cookieStore.delete('session');
    return { status: 'signed-out' };
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      (await cookies()).delete('session');
      return { status: 'signed-out' };
    }
    return { status: 'signed-in', email: user.email };
  } catch {
    return { status: 'error', message: 'Account status is temporarily unavailable.' };
  }
}
