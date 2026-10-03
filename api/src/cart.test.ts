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

const products = [
  {
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
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  },
  {
    id: 'product-2',
    source: 'approved-source',
    sourceId: '2',
    title: 'Notebook',
    description: 'A lined notebook.',
    category: 'stationery',
    price: new Prisma.Decimal('3.99'),
    thumbnailUrl: null,
    images: [],
    brand: null,
    createdAt: new Date('2026-10-03T00:00:00.000Z'),
    updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  },
];

describe('POST /api/cart/quote', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findMany).mockReset();
  });

  it('returns current catalogue prices and calculates the cart total', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue(products);

    const response = await request(app)
      .post('/api/cart/quote')
      .send({
        items: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 3 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [
        {
          product: {
            id: 'product-1',
            title: 'Desk Lamp',
            description: 'A compact desk lamp.',
            category: 'lighting',
            price: 24.5,
            thumbnailUrl: 'https://images.example.test/lamp.jpg',
            images: ['https://images.example.test/lamp.jpg'],
            brand: 'Northlight',
          },
          quantity: 2,
          lineTotal: 49,
        },
        {
          product: {
            id: 'product-2',
            title: 'Notebook',
            description: 'A lined notebook.',
            category: 'stationery',
            price: 3.99,
            thumbnailUrl: null,
            images: [],
            brand: null,
          },
          quantity: 3,
          lineTotal: 11.97,
        },
      ],
      unavailableProductIds: [],
      itemCount: 5,
      subtotal: 60.97,
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['product-1', 'product-2'] } },
    });
  });

  it('identifies products that are no longer in the catalogue', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([products[0]]);

    const response = await request(app)
      .post('/api/cart/quote')
      .send({
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'removed-item', quantity: 2 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.unavailableProductIds).toEqual(['removed-item']);
    expect(response.body.itemCount).toBe(1);
    expect(response.body.subtotal).toBe(24.5);
  });

  it('returns an empty quote without querying products', async () => {
    const response = await request(app).post('/api/cart/quote').send({ items: [] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      unavailableProductIds: [],
      itemCount: 0,
      subtotal: 0,
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { items: [{ productId: 'product-1', quantity: 0 }] },
    { items: [{ productId: 'product-1', quantity: 100 }] },
    { items: [{ productId: '', quantity: 1 }] },
    {
      items: [
        { productId: 'product-1', quantity: 1 },
        { productId: 'product-1', quantity: 2 },
      ],
    },
    { items: [{ productId: 'product-1', quantity: 1, extra: true }] },
    { items: [], extra: true },
    {
      items: Array.from({ length: 51 }, (_, index) => ({
        productId: `product-${index}`,
        quantity: 1,
      })),
    },
  ])('rejects invalid cart input without querying the database: %j', async (body) => {
    const response = await request(app).post('/api/cart/quote').send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CART');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('returns an explicit unavailable response when the catalogue cannot connect', async () => {
    vi.mocked(prisma.product.findMany).mockRejectedValue(
      new Prisma.PrismaClientInitializationError('database unavailable', '6.19.3'),
    );

    const response = await request(app)
      .post('/api/cart/quote')
      .send({ items: [{ productId: 'product-1', quantity: 1 }] });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CART_UNAVAILABLE');
  });
});
