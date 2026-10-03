import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHomeProducts } from './products';

describe('getHomeProducts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('requests the bounded home catalogue through the server API', async () => {
    vi.stubEnv('API_URL', 'http://localhost:4000');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHomeProducts()).resolves.toEqual({ products: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/products?limit=8', 'http://localhost:4000'),
      undefined,
    );
  });
});
