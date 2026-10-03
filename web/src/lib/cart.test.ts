import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { quoteGuestCart } from '../actions/cart';
import {
  GUEST_CART_STORAGE_KEY,
  guestCartSchema,
  parseGuestCart,
  readGuestCart,
  writeGuestCart,
} from './cart';

describe('guestCartSchema', () => {
  it('accepts an empty cart and bounded product quantities', () => {
    expect(guestCartSchema.parse([])).toEqual([]);
    expect(guestCartSchema.parse([{ productId: 'product-1', quantity: 2 }])).toEqual([
      { productId: 'product-1', quantity: 2 },
    ]);
  });

  it.each([
    [{ productId: '', quantity: 1 }],
    [{ productId: 'product-1', quantity: 0 }],
    [{ productId: 'product-1', quantity: 100 }],
    [
      { productId: 'product-1', quantity: 1 },
      { productId: 'product-1', quantity: 2 },
    ],
    Array.from({ length: 51 }, (_, index) => ({ productId: `product-${index}`, quantity: 1 })),
  ])('rejects invalid guest-cart entries', (items) => {
    expect(guestCartSchema.safeParse(items).success).toBe(false);
  });
});

describe('parseGuestCart', () => {
  it('parses valid persisted cart data', () => {
    expect(parseGuestCart('[{"productId":"product-1","quantity":3}]')).toEqual([
      { productId: 'product-1', quantity: 3 },
    ]);
  });

  it('rejects malformed persisted JSON instead of silently clearing it', () => {
    expect(() => parseGuestCart('{')).toThrow();
  });

  it('rejects persisted entries that do not match the cart contract', () => {
    expect(() => parseGuestCart('[{"productId":"product-1","quantity":0}]')).toThrow();
  });
});

describe('guest cart persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and reads only product IDs and quantities', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    writeGuestCart([{ productId: 'product-1', quantity: 2 }]);

    expect(values.get(GUEST_CART_STORAGE_KEY)).toBe('[{"productId":"product-1","quantity":2}]');
    expect(readGuestCart()).toEqual([{ productId: 'product-1', quantity: 2 }]);
  });
});

describe('quoteGuestCart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the bounded guest cart to the API quote endpoint', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const quote = {
      items: [],
      unavailableProductIds: [],
      itemCount: 0,
      subtotal: 0,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(quote), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(quoteGuestCart([])).resolves.toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/cart/quote', 'http://localhost:4000'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ items: [] }),
        cache: 'no-store',
      }),
    );
  });

  it('rejects invalid cart input before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(quoteGuestCart([{ productId: 'product-1', quantity: 0 }])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
