import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHomeProducts, getProduct, getProducts } from './products';

describe('getHomeProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('requests the bounded home catalogue through the server API', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [],
          pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHomeProducts()).resolves.toEqual({
      products: [],
      pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/products?limit=8', 'http://localhost:4000'),
      undefined,
    );
  });

  it('encodes URL-driven search filters and pagination for the API', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [],
          pagination: { page: 2, limit: 24, total: 30, totalPages: 2 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getProducts({
      q: 'desk lamp',
      category: 'home decor',
      minPrice: '10',
      maxPrice: '50',
      sort: 'price-asc',
      page: '2',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        '/products?q=desk+lamp&category=home+decor&minPrice=10&maxPrice=50&sort=price-asc&page=2',
        'http://localhost:4000',
      ),
      undefined,
    );
  });

  it('requests a product by an encoded stable identifier', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ product: { id: 'item/a' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getProduct('item/a');

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/products/item%2Fa', 'http://localhost:4000'),
      undefined,
    );
  });
});
