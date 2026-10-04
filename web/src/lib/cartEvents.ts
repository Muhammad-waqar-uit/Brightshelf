'use client';

import type { GuestCartQuote } from '@/lib/cart';

export const CART_COUNT_EVENT = 'brightshelf:cart-count';
export const ACCOUNT_CART_SYNC_EVENT = 'brightshelf:account-cart-sync';

export function dispatchCartCount(itemCount: number): void {
  window.dispatchEvent(new CustomEvent(CART_COUNT_EVENT, { detail: { itemCount } }));
}

export function dispatchAccountCartSync(detail: {
  quote: GuestCartQuote;
  rejectedProductIds: string[];
}): void {
  window.dispatchEvent(new CustomEvent(ACCOUNT_CART_SYNC_EVENT, { detail }));
}
