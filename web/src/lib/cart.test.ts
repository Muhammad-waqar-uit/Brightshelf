import { describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import { cookies } from 'next/headers';
import { loadCart, mergeGuestCart, quoteGuestCart } from '../actions/cart';
import {
  GUEST_CART_STORAGE_KEY,
  GUEST_CART_MERGE_STORAGE_KEY,
  guestCartSchema,
  getGuestCartMergeKey,
  parseGuestCart,
  readGuestCart,
  writeGuestCart,
} from './cart';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

const mockCookies = vi.mocked(cookies);
const emptyQuote = {
  items: [],
  unavailableProductIds: [],
  itemCount: 0,
  subtotal: 0,
};

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
      crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    writeGuestCart([{ productId: 'product-1', quantity: 2 }]);

    expect(values.get(GUEST_CART_STORAGE_KEY)).toBe('[{"productId":"product-1","quantity":2}]');
    expect(readGuestCart()).toEqual([{ productId: 'product-1', quantity: 2 }]);
  });

  it('reuses a merge key for retries and rotates it after the cart changes', () => {
    const values = new Map<string, string>();
    const keys = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    vi.stubGlobal('window', {
      crypto: { randomUUID: () => keys.shift() },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const firstSnapshot = [{ productId: 'product-1', quantity: 1 }];
    const secondSnapshot = [{ productId: 'product-1', quantity: 2 }];

    const firstKey = getGuestCartMergeKey(firstSnapshot);
    expect(getGuestCartMergeKey(firstSnapshot)).toBe(firstKey);
    expect(getGuestCartMergeKey(secondSnapshot)).not.toBe(firstKey);
    expect(values.has(GUEST_CART_MERGE_STORAGE_KEY)).toBe(true);

    writeGuestCart([]);
    expect(values.has(GUEST_CART_MERGE_STORAGE_KEY)).toBe(false);
  });
});

describe('quoteGuestCart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockCookies.mockReset();
  });

  it('sends the bounded guest cart to the API quote endpoint', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyQuote), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(quoteGuestCart([])).resolves.toEqual(emptyQuote);
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

describe('account cart actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockCookies.mockReset();
  });

  it('forwards the verified session cookie when loading an account cart', async () => {
    mockCookies.mockResolvedValue({
      get: () => ({ value: 'signed-session' }),
    } as never);
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyQuote), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCart([])).resolves.toEqual({
      signedIn: true,
      quote: emptyQuote,
      rejectedProductIds: [],
    });
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('cookie')).toBe('session=signed-session');
  });

  it('merges guest entries and returns server-reported rejected products', async () => {
    mockCookies.mockResolvedValue({
      get: () => ({ value: 'signed-session' }),
    } as never);
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const mergeResponse = { cart: emptyQuote, rejectedProductIds: ['removed-product'] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mergeResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      mergeGuestCart(
        [{ productId: 'removed-product', quantity: 1 }],
        '00000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({
      quote: emptyQuote,
      rejectedProductIds: ['removed-product'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/cart/merge', 'http://localhost:4000'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          items: [{ productId: 'removed-product', quantity: 1 }],
          idempotencyKey: '00000000-0000-4000-8000-000000000001',
        }),
      }),
    );
  });
});
