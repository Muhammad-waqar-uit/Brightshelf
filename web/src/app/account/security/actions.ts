'use server';

import { cookies } from 'next/headers';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { z } from 'zod';

type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string };

export type PasskeySummary = {
  id: string;
  label: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const idSchema = z.string().min(1).max(64);
const labelSchema = z.string().trim().min(1).max(80);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCredentialResponse(
  value: unknown,
): value is RegistrationResponseJSON | AuthenticationResponseJSON {
  return Boolean(
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.rawId === 'string' &&
    value.type === 'public-key' &&
    isRecord(value.response) &&
    typeof value.response.clientDataJSON === 'string' &&
    isRecord(value.clientExtensionResults),
  );
}

function isCreationOptions(value: unknown): value is PublicKeyCredentialCreationOptionsJSON {
  return Boolean(
    isRecord(value) &&
    typeof value.challenge === 'string' &&
    isRecord(value.rp) &&
    typeof value.rp.id === 'string' &&
    isRecord(value.user) &&
    typeof value.user.id === 'string' &&
    Array.isArray(value.pubKeyCredParams),
  );
}

function isRequestOptions(value: unknown): value is PublicKeyCredentialRequestOptionsJSON {
  return Boolean(
    isRecord(value) &&
    typeof value.challenge === 'string' &&
    typeof value.rpId === 'string' &&
    value.userVerification === 'required',
  );
}

function getApiUrl(): string {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error('API_URL is not configured');
  }
  return apiUrl;
}

async function requestPasskeyApi<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  requireSession = true,
): Promise<{ response: Response; body: T | null }> {
  const session = (await cookies()).get('session')?.value;
  if (requireSession && !session) {
    throw new Error('Your session has expired. Sign in again and retry.');
  }

  const response = await fetch(new URL(path, getApiUrl()), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { cookie: `session=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });

  let responseBody: T | null = null;
  try {
    responseBody = (await response.json()) as T;
  } catch {
    if (response.ok) {
      throw new Error('The passkey service returned an invalid response.');
    }
  }
  return { response, body: responseBody };
}

function getFailureMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
    return body.error.message;
  }
  return fallback;
}

export async function listPasskeys(): Promise<ActionResult<PasskeySummary[]>> {
  try {
    const { response, body } = await requestPasskeyApi<{ passkeys?: unknown }>(
      '/api/auth/passkeys',
      'GET',
    );
    if (!response.ok) {
      return { ok: false, message: getFailureMessage(body, 'Passkeys could not be loaded.') };
    }
    const summarySchema = z.object({
      id: z.string(),
      label: z.string(),
      deviceType: z.enum(['singleDevice', 'multiDevice']),
      backedUp: z.boolean(),
      createdAt: z.string(),
      lastUsedAt: z.string().nullable(),
    });
    const parsed = z.object({ passkeys: z.array(summarySchema) }).safeParse(body);
    if (!parsed.success) {
      return { ok: false, message: 'The passkey service returned an invalid list.' };
    }
    return { ok: true, value: parsed.data.passkeys };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service.' };
  }
}

export async function getRegistrationOptions(): Promise<
  ActionResult<PublicKeyCredentialCreationOptionsJSON>
> {
  try {
    const { response, body } = await requestPasskeyApi<{ options?: unknown }>(
      '/api/auth/passkeys/registration/options',
      'POST',
      {},
    );
    if (!response.ok) {
      return {
        ok: false,
        message: getFailureMessage(body, 'Passkey registration could not start. Try again.'),
      };
    }
    if (!body || !isCreationOptions(body.options)) {
      return { ok: false, message: 'The passkey service returned invalid registration options.' };
    }
    return { ok: true, value: body.options };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try again.' };
  }
}

export async function verifyRegistration(
  responseValue: unknown,
  labelValue: unknown,
): Promise<ActionResult<undefined>> {
  const response = z
    .custom<RegistrationResponseJSON>(isCredentialResponse)
    .safeParse(responseValue);
  const label = labelSchema.safeParse(labelValue);
  if (!response.success || !label.success) {
    return { ok: false, message: 'Passkey details were invalid. Please retry registration.' };
  }

  try {
    const result = await requestPasskeyApi<unknown>(
      '/api/auth/passkeys/registration/verify',
      'POST',
      { response: response.data, label: label.data },
    );
    if (!result.response.ok) {
      return {
        ok: false,
        message: getFailureMessage(result.body, 'Passkey registration failed. Try again.'),
      };
    }
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try again.' };
  }
}

export async function getAuthenticationOptions(): Promise<
  ActionResult<PublicKeyCredentialRequestOptionsJSON>
> {
  try {
    const { response, body } = await requestPasskeyApi<{ options?: unknown }>(
      '/api/auth/passkeys/authentication/options',
      'POST',
      {},
      false,
    );
    if (!response.ok) {
      return {
        ok: false,
        message: getFailureMessage(body, 'Passkey sign-in could not start. Try email or Google.'),
      };
    }
    if (!body || !isRequestOptions(body.options)) {
      return { ok: false, message: 'The passkey service returned invalid sign-in options.' };
    }
    return { ok: true, value: body.options };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try email or Google.' };
  }
}

export async function verifyAuthentication(
  responseValue: unknown,
): Promise<ActionResult<undefined>> {
  const response = z
    .custom<AuthenticationResponseJSON>(isCredentialResponse)
    .safeParse(responseValue);
  if (!response.success) {
    return {
      ok: false,
      message: 'The passkey response was invalid. Retry or use email or Google.',
    };
  }

  try {
    const result = await requestPasskeyApi<{ user?: { id?: unknown; email?: unknown } }>(
      '/api/auth/passkeys/authentication/verify',
      'POST',
      { response: response.data },
      false,
    );
    if (!result.response.ok) {
      return {
        ok: false,
        message: getFailureMessage(
          result.body,
          'Passkey sign-in failed. Retry or use email or Google.',
        ),
      };
    }
    if (
      !result.body ||
      typeof result.body.user?.id !== 'string' ||
      typeof result.body.user.email !== 'string'
    ) {
      return {
        ok: false,
        message: 'The passkey service returned an invalid sign-in result. Try email or Google.',
      };
    }

    const setCookie = result.response.headers.get('set-cookie');
    const sessionToken = setCookie?.match(/(?:^|,\s*)session=([^;,\s]+)/)?.[1];
    if (!sessionToken) {
      return {
        ok: false,
        message: 'Passkey sign-in could not establish a secure session. Try email or Google.',
      };
    }
    (await cookies()).set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try again.' };
  }
}

export async function renamePasskey(
  idValue: unknown,
  labelValue: unknown,
): Promise<ActionResult<undefined>> {
  const id = idSchema.safeParse(idValue);
  const label = labelSchema.safeParse(labelValue);
  if (!id.success || !label.success) {
    return { ok: false, message: 'Enter a passkey label of 1 to 80 characters.' };
  }
  try {
    const { response, body } = await requestPasskeyApi<unknown>(
      `/api/auth/passkeys/${encodeURIComponent(id.data)}`,
      'PATCH',
      { label: label.data },
    );
    if (!response.ok) {
      return { ok: false, message: getFailureMessage(body, 'Passkey name was not saved.') };
    }
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try again.' };
  }
}

export async function removePasskey(idValue: unknown): Promise<ActionResult<undefined>> {
  const id = idSchema.safeParse(idValue);
  if (!id.success) {
    return { ok: false, message: 'That passkey could not be identified.' };
  }
  try {
    const { response, body } = await requestPasskeyApi<unknown>(
      `/api/auth/passkeys/${encodeURIComponent(id.data)}`,
      'DELETE',
    );
    if (!response.ok) {
      return { ok: false, message: getFailureMessage(body, 'Passkey was not removed.') };
    }
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, message: 'We could not reach the passkey service. Try again.' };
  }
}
