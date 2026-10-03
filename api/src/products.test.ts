import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { prisma } from './lib/prisma';

vi.mock('./lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
  },
}));

describe('GET /products', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findMany).mockReset();
  });

  it('returns a bounded catalogue page with numeric prices', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: 'product-1',
        source: 'approved-source',
        sourceId: '1',
        title: 'Desk Lamp',
        description: 'A compact desk lamp.',
        category: 'home',
        price: new Prisma.Decimal('24.50'),
        thumbnailUrl: 'https://images.example.test/lamp.jpg',
        images: ['https://images.example.test/lamp.jpg'],
        brand: 'Northlight',
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
        updatedAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    ]);

    const response = await request(app).get('/products?limit=4');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      products: [
        {
          id: 'product-1',
          title: 'Desk Lamp',
          description: 'A compact desk lamp.',
          category: 'home',
          price: 24.5,
          thumbnailUrl: 'https://images.example.test/lamp.jpg',
          images: ['https://images.example.test/lamp.jpg'],
          brand: 'Northlight',
        },
      ],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
  });

  it('uses a bounded default when no limit is provided', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    const response = await request(app).get('/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ products: [] });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
  });

  it('rejects an invalid limit before querying the database', async () => {
    const response = await request(app).get('/products?limit=25');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_QUERY',
        message: 'limit must be an integer between 1 and 24',
      },
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('returns an explicit unavailable response when the database cannot connect', async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('database unavailable', '6.19.3'),
    );

    const response = await request(app).get('/products');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'CATALOG_UNAVAILABLE',
        message: 'The product catalog is temporarily unavailable',
      },
    });
  });
});
