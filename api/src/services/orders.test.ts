import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { getOrder, listOrders, listSellerSales } from './orders';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn(), findFirst: vi.fn() },
  orderItem: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

const legacyOrder = {
  id: 'order-1',
  userId: 'buyer-1',
  status: 'PLACED',
  paymentMethod: 'SIMULATED',
  paymentStatus: 'NOT_REQUIRED',
  subtotal: new Prisma.Decimal('25.98'),
  shipping: new Prisma.Decimal('0'),
  total: new Prisma.Decimal('25.98'),
  shippingName: 'Test Customer',
  shippingAddressLine1: '123 Sample Street',
  shippingAddressLine2: null,
  shippingCity: 'Testville',
  shippingRegion: 'CA',
  shippingPostalCode: '90210',
  shippingCountry: 'US',
  createdAt: new Date('2026-10-06T12:00:00.000Z'),
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      productTitle: 'Legacy demo item',
      quantity: 2,
      unitPrice: new Prisma.Decimal('12.99'),
      lineTotal: new Prisma.Decimal('25.98'),
      sellerId: null,
      sellerName: null,
    },
  ],
};

describe('order read services', () => {
  beforeEach(() => {
    vi.mocked(prisma.order.findMany).mockReset();
    vi.mocked(prisma.order.findFirst).mockReset();
    vi.mocked(prisma.orderItem.findMany).mockReset();
  });

  it('keeps buyer order history bounded and owner-scoped', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'order-1',
        status: 'PLACED',
        paymentMethod: 'SIMULATED',
        paymentStatus: 'NOT_REQUIRED',
        total: new Prisma.Decimal('25.98'),
        createdAt: legacyOrder.createdAt,
        _count: { items: 1 },
      },
    ] as never);

    await expect(listOrders('buyer-1', { limit: 10 })).resolves.toMatchObject({
      orders: [
        {
          id: 'order-1',
          status: 'PLACED',
          paymentMethod: 'SIMULATED',
          paymentStatus: 'NOT_REQUIRED',
          total: 25.98,
        },
      ],
      nextCursor: null,
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'buyer-1' },
        take: 11,
      }),
    );
  });

  it('serializes legacy order snapshots and only returns the requesting buyer order', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(legacyOrder as never);

    await expect(getOrder('buyer-1', 'order-1')).resolves.toMatchObject({
      id: 'order-1',
      paymentStatus: 'NOT_REQUIRED',
      items: [{ productTitle: 'Legacy demo item', sellerName: null }],
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', userId: 'buyer-1' },
      include: { items: true },
    });
  });

  it('returns only seller-owned line item snapshots without buyer addresses or other lines', async () => {
    vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
      {
        id: 'item-1',
        productTitle: 'Seller item',
        quantity: 2,
        unitPrice: new Prisma.Decimal('12.99'),
        lineTotal: new Prisma.Decimal('25.98'),
        sellerName: 'Seller A',
        order: {
          id: 'order-1',
          status: 'PAID',
          paymentStatus: 'PAID',
          createdAt: legacyOrder.createdAt,
        },
      },
    ] as never);

    const result = await listSellerSales('seller-a', 1, 20);

    expect(result.sales).toEqual([
      {
        id: 'item-1',
        orderId: 'order-1',
        productTitle: 'Seller item',
        sellerName: 'Seller A',
        quantity: 2,
        unitPrice: 12.99,
        lineTotal: 25.98,
        status: 'PAID',
        paymentStatus: 'PAID',
        createdAt: '2026-10-06T12:00:00.000Z',
      },
    ]);
    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: 'seller-a' },
        take: 21,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('shippingAddress');
  });
});
