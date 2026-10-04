'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { guestCartSchema, type GuestCartQuote } from '@/lib/cart';

export type CartLoadResult = {
  signedIn: boolean;
  quote: GuestCartQuote;
  rejectedProductIds: string[];
};

export type GuestMergeResult = {
  quote: GuestCartQuote;
  rejectedProductIds: string[];
};

type AccountCartResponse = GuestCartQuote;
type AccountMergeResponse = {
  cart: GuestCartQuote;
  rejectedProductIds: string[];
};

async function sessionCookie(): Promise<string | null> {
  const session = (await cookies()).get('session')?.value;
  return session ? `session=${session}` : null;
}

async function accountApiFetch<T>(path: string, session: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Cookie', session);
  return apiFetch<T>(path, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function quoteGuestCart(input: unknown): Promise<GuestCartQuote> {
  const items = guestCartSchema.parse(input);

  return apiFetch<GuestCartQuote>('/api/cart/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
    cache: 'no-store',
  });
}

export async function loadCart(input: unknown): Promise<CartLoadResult> {
  const items = guestCartSchema.parse(input);
  const session = await sessionCookie();
  if (session) {
    const quote = await accountApiFetch<AccountCartResponse>('/api/cart', session);
    return { signedIn: true, quote, rejectedProductIds: [] };
  }

  const quote = await quoteGuestCart(items);
  return { signedIn: false, quote, rejectedProductIds: [] };
}

export async function mergeGuestCart(
  input: unknown,
  idempotencyKey: string,
): Promise<GuestMergeResult | null> {
  const items = guestCartSchema.parse(input);
  const key = z.string().uuid().parse(idempotencyKey);
  const session = await sessionCookie();
  if (!session) {
    return null;
  }

  const result = await accountApiFetch<AccountMergeResponse>('/api/cart/merge', session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, idempotencyKey: key }),
  });
  return { quote: result.cart, rejectedProductIds: result.rejectedProductIds };
}

export async function replaceCart(input: unknown): Promise<CartLoadResult> {
  const items = guestCartSchema.parse(input);
  const session = await sessionCookie();
  if (session) {
    const quote = await accountApiFetch<AccountCartResponse>('/api/cart', session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return { signedIn: true, quote, rejectedProductIds: [] };
  }

  const quote = await quoteGuestCart(items);
  return { signedIn: false, quote, rejectedProductIds: [] };
}

export async function addAccountCartItem(input: unknown): Promise<GuestCartQuote | null> {
  const parsed = guestCartSchema.element.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid cart item');
  }
  const session = await sessionCookie();
  if (!session) {
    return null;
  }

  return accountApiFetch<GuestCartQuote>('/api/cart/items', session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
}
