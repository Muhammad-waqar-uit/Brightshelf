import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import { processStripeEvent } from './stripeWebhooks';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

const transaction = {
  stripeEvent: { create: vi.fn() },
  order: { findFirst: vi.fn(), updateMany: vi.fn() },
  cartItem: { deleteMany: vi.fn() },
  $executeRaw: vi.fn(),
};

const order = {
  id: 'order-1',
  userId: 'buyer-1',
  status: 'PENDING_PAYMENT',
  stripeSessionId: 'cs_test_1',
  stockReserved: true,
  total: new Prisma.Decimal('25.98'),
  items: [
    { productId: 'product-1', quantity: 2 },
    { productId: 'product-2', quantity: 1 },
  ],
};

function event(type: string, overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  const session = {
    id: 'cs_test_1',
    metadata: { orderId: 'order-1' },
    payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
    currency: 'usd',
    amount_total: 2598,
    ...overrides,
  } as Stripe.Checkout.Session;
  return {
    id: `evt_${type.replaceAll('.', '_')}`,
    type,
    data: { object: session },
  } as Stripe.Event;
}

describe('Stripe webhook service', () => {
  beforeEach(() => {
    transaction.stripeEvent.create.mockReset().mockResolvedValue({});
    transaction.order.findFirst.mockReset().mockResolvedValue(order);
    transaction.order.updateMany.mockReset().mockResolvedValue({ count: 1 });
    transaction.cartItem.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    transaction.$executeRaw.mockReset().mockResolvedValue(2);
    vi.mocked(prisma.$transaction)
      .mockReset()
      .mockImplementation(async (operation) => operation(transaction as never) as never);
  });

  it('marks a verified paid order once and clears only unchanged purchased cart lines', async () => {
    await expect(processStripeEvent(event('checkout.session.completed'))).resolves.toBe(
      'processed',
    );

    expect(transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order-1',
          status: 'PENDING_PAYMENT',
          stripeSessionId: 'cs_test_1',
        },
        data: { status: 'PAID', paymentStatus: 'PAID', stockReserved: false },
      }),
    );
    expect(transaction.cartItem.deleteMany).toHaveBeenCalledWith({
      where: {
        cart: { userId: 'buyer-1' },
        OR: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 1 },
        ],
      },
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('releases reserved stock and retains the cart for an expired checkout', async () => {
    await processStripeEvent(event('checkout.session.expired'));

    expect(transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELED',
          paymentStatus: 'CANCELED',
          stockReserved: false,
        }),
      }),
    );
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(transaction.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('cancels an opted-in synthetic checkout without restoring unreserved stock', async () => {
    transaction.order.findFirst.mockResolvedValueOnce({
      ...order,
      stockReserved: false,
      items: [{ productId: 'demo-product', quantity: 1 }],
    });

    await processStripeEvent(event('checkout.session.expired'));

    expect(transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order-1',
          status: 'PENDING_PAYMENT',
          stripeSessionId: 'cs_test_1',
        },
        data: expect.objectContaining({
          status: 'CANCELED',
          paymentStatus: 'CANCELED',
          stockReserved: false,
        }),
      }),
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not downgrade a paid order when a later failure event arrives', async () => {
    transaction.order.findFirst.mockResolvedValueOnce({ ...order, status: 'PAID' });
    transaction.order.updateMany.mockResolvedValueOnce({ count: 0 });

    await processStripeEvent(event('checkout.session.async_payment_failed'));

    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a payment amount that differs from the persisted order', async () => {
    await expect(
      processStripeEvent(event('checkout.session.completed', { amount_total: 1 })),
    ).rejects.toThrow('Stripe session amount does not match the persisted order total');
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('treats duplicate Stripe event IDs as idempotent', async () => {
    transaction.stripeEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate event', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(processStripeEvent(event('checkout.session.completed'))).resolves.toBe(
      'duplicate',
    );
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
  });
});
