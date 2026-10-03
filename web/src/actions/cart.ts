'use server';

import { apiFetch } from '@/lib/api';
import { guestCartSchema, type GuestCartQuote } from '@/lib/cart';

export async function quoteGuestCart(input: unknown): Promise<GuestCartQuote> {
  const items = guestCartSchema.parse(input);

  return apiFetch<GuestCartQuote>('/api/cart/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
    cache: 'no-store',
  });
}
