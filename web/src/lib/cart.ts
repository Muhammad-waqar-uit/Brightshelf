import { z } from 'zod';
import type { StoreProduct } from './products';

export const guestCartSchema = z
  .array(
    z
      .object({
        productId: z.string().min(1).max(128),
        quantity: z.number().int().min(1).max(99),
      })
      .strict(),
  )
  .max(50)
  .refine(
    (items) => new Set(items.map(({ productId }) => productId)).size === items.length,
    'A product may appear only once in the cart',
  );

export type GuestCartEntry = z.infer<typeof guestCartSchema>[number];

export interface GuestCartQuote {
  items: {
    product: StoreProduct;
    quantity: number;
    lineTotal: number;
  }[];
  unavailableProductIds: string[];
  itemCount: number;
  subtotal: number;
}

export const GUEST_CART_STORAGE_KEY = 'brightshelf.guest-cart.v1';
export const GUEST_CART_MERGE_STORAGE_KEY = 'brightshelf.guest-cart-merge.v1';

const pendingMergeSchema = z
  .object({
    snapshot: z.string(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export function parseGuestCart(value: string | null): GuestCartEntry[] {
  if (value === null) {
    return [];
  }

  return guestCartSchema.parse(JSON.parse(value));
}

export function readGuestCart(): GuestCartEntry[] {
  return parseGuestCart(window.localStorage.getItem(GUEST_CART_STORAGE_KEY));
}

export function writeGuestCart(items: GuestCartEntry[]): void {
  const safeItems = guestCartSchema.parse(items);
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(safeItems));
  window.localStorage.removeItem(GUEST_CART_MERGE_STORAGE_KEY);
}

export function getGuestCartMergeKey(items: GuestCartEntry[]): string {
  const snapshot = JSON.stringify(guestCartSchema.parse(items));
  const storedValue = window.localStorage.getItem(GUEST_CART_MERGE_STORAGE_KEY);
  if (storedValue !== null) {
    const pendingMerge = pendingMergeSchema.parse(JSON.parse(storedValue));
    if (pendingMerge.snapshot === snapshot) {
      return pendingMerge.idempotencyKey;
    }
  }

  const idempotencyKey = window.crypto.randomUUID();
  window.localStorage.setItem(
    GUEST_CART_MERGE_STORAGE_KEY,
    JSON.stringify({ snapshot, idempotencyKey }),
  );
  return idempotencyKey;
}
