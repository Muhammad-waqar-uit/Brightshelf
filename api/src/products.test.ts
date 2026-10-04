import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { prisma } from './lib/prisma';

vi.mock('./lib/prisma', () => ({
  prisma: {
    product: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const sampleProduct = {
  id: 'product-1',
  source: 'approved-source',
  sourceId: '1',
  title: 'Desk Lamp',
  description: 'A compact desk lamp.',
  category: 'lighting',
  price: new Prisma.Decimal('24.50'),
  thumbnailUrl: 'https://images.example.test/lamp.jpg',
  images: ['https://images.example.test/lamp.jpg'],
  brand: 'Northlight',
  sellerId: null,
  seller: null,
  listingStatus: 'PUBLISHED' as const,
  stock: 0,
  createdAt: new Date('2026-10-03T00:00:00.000Z'),
  updatedAt: new Date('2026-10-03T00:00:00.000Z'),
};

describe('GET /api/products', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.count).mockReset();
    vi.mocked(prisma.product.findMany).mockReset();
    vi.mocked(prisma.product.findUnique).mockReset();
    vi.mocked(prisma.product.findFirst).mockReset();
  });

  it('returns a filtered, bounded page with numeric prices and pagination', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(21);
    vi.mocked(prisma.product.findMany).mockResolvedValue([sampleProduct]);

    const response = await request(app).get(
      '/api/products?q=lamp&category=lighting&minPrice=20&maxPrice=30&sort=price-asc&page=2&limit=5',
    );
    const where = {
      AND: [
        {
          OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
        },
        {
          OR: [
            { title: { contains: 'lamp', mode: 'insensitive' } },
            { brand: { contains: 'lamp', mode: 'insensitive' } },
          ],
        },
      ],
      category: 'lighting',
      price: { gte: 20, lte: 30 },
    };

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      products: [
        {
          id: 'product-1',
          isSyntheticDemo: false,
          syntheticCheckoutEnabled: false,
          title: 'Desk Lamp',
          description: 'A compact desk lamp.',
          category: 'lighting',
          price: 24.5,
          thumbnailUrl: 'https://images.example.test/lamp.jpg',
          images: ['https://images.example.test/lamp.jpg'],
          brand: 'Northlight',
          stock: 0,
          sellerName: null,
        },
      ],
      pagination: { page: 2, limit: 5, total: 21, totalPages: 5 },
    });
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ price: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
      include: { seller: { select: { displayName: true } } },
    });
  });

  it('includes published seller display names and available inventory in discovery results', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        ...sampleProduct,
        sellerId: 'seller-profile-1',
        seller: { displayName: 'Northlight Goods' },
        stock: 4,
      },
    ] as never);

    const response = await request(app).get('/api/products');

    expect(response.status).toBe(200);
    expect(response.body.products[0]).toMatchObject({
      sellerName: 'Northlight Goods',
      stock: 4,
    });
  });

  it('uses the bounded default page size and returns an intentional empty result', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(0);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    const response = await request(app).get('/api/products');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      products: [],
      pagination: { page: 1, limit: 24, total: 0, totalPages: 0 },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 24,
      include: { seller: { select: { displayName: true } } },
    });
  });

  it('treats empty form fields as omitted search filters', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(0);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);

    const response = await request(app).get(
      '/api/products?q=&category=&minPrice=&maxPrice=&sort=newest',
    );

    expect(response.status).toBe(200);
    const publicWhere = {
      AND: [
        {
          OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
        },
      ],
    };
    expect(prisma.product.count).toHaveBeenCalledWith({ where: publicWhere });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: publicWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 24,
      include: { seller: { select: { displayName: true } } },
    });
  });

  it.each([
    '/api/products?minPrice=30&maxPrice=20',
    '/api/products?limit=101',
    '/api/products?page=0',
    '/api/products?sort=discount',
    '/api/products?q=%20',
    '/api/products?unknown=value',
  ])('rejects invalid query parameters without querying the database: %s', async (url) => {
    const response = await request(app).get(url);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY');
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('uses the requested descending price sort', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(1);
    vi.mocked(prisma.product.findMany).mockResolvedValue([sampleProduct]);

    const response = await request(app).get('/api/products?sort=price-desc');

    expect(response.status).toBe(200);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
          },
        ],
      },
      orderBy: [{ price: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 24,
      include: { seller: { select: { displayName: true } } },
    });
  });

  it('clamps an out-of-range page to the last available page', async () => {
    vi.mocked(prisma.product.count).mockResolvedValue(9);
    vi.mocked(prisma.product.findMany).mockResolvedValue([sampleProduct]);

    const response = await request(app).get('/api/products?page=10&limit=8');

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 8,
      total: 9,
      totalPages: 2,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 8,
      take: 8,
      include: { seller: { select: { displayName: true } } },
    });
  });

  it('returns an explicit unavailable response when the database cannot connect', async () => {
    vi.mocked(prisma.product.count).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('database unavailable', '6.19.3'),
    );

    const response = await request(app).get('/api/products');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: 'CATALOG_UNAVAILABLE',
        message: 'The product catalog is temporarily unavailable',
      },
    });
  });

  it('returns one product by stable ID with a numeric price', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(sampleProduct);

    const response = await request(app).get('/api/products/product-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      product: {
        id: 'product-1',
        isSyntheticDemo: false,
        syntheticCheckoutEnabled: false,
        title: 'Desk Lamp',
        description: 'A compact desk lamp.',
        category: 'lighting',
        price: 24.5,
        thumbnailUrl: 'https://images.example.test/lamp.jpg',
        images: ['https://images.example.test/lamp.jpg'],
        brand: 'Northlight',
        stock: 0,
        sellerName: null,
      },
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'product-1',
        OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
      },
      include: { seller: { select: { displayName: true } } },
    });
  });

  it('returns seller display and current stock for a published seller listing', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({
      ...sampleProduct,
      sellerId: 'seller-1',
      seller: { displayName: 'Northlight Goods' },
      stock: 3,
    } as never);

    const response = await request(app).get('/api/products/seller-product');

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject({
      sellerName: 'Northlight Goods',
      stock: 3,
    });
  });

  it('returns a structured not-found response for an unknown product ID', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    const response = await request(app).get('/api/products/unknown-product');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found',
      },
    });
  });

  it('returns distinct product categories in sorted order', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { ...sampleProduct, category: 'Garden' },
      { ...sampleProduct, category: 'Home and Office' },
      { ...sampleProduct, category: 'Lighting' },
    ]);

    const response = await request(app).get('/api/products/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      categories: ['Garden', 'Home and Office', 'Lighting'],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' }],
      },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      select: { category: true },
    });
  });

  it('returns an explicit unavailable response when categories cannot connect', async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('database unavailable', '6.19.3'),
    );

    const response = await request(app).get('/api/products/categories');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });

  it('rejects an overlong product ID before querying the database', async () => {
    const response = await request(app).get(`/api/products/${'x'.repeat(129)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PRODUCT_ID');
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('returns an explicit unavailable response when the product read cannot connect', async () => {
    vi.mocked(prisma.product.findFirst).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('database unavailable', '6.19.3'),
    );

    const response = await request(app).get('/api/products/product-1');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });
});
