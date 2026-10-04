import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { cancelStripeCheckout, createStripeCheckoutSession } from './stripeCheckout';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
}));
const stripeMocks = vi.hoisted(() => ({
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutExpire: vi.fn(),
  getStripeClient: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));
vi.mock('../lib/stripe', () => ({
  getStripeClient: stripeMocks.getStripeClient,
  StripeConfigurationError: class StripeConfigurationError extends Error {},
}));

const transaction = {
  cart: { findUnique: vi.fn() },
  order: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(),
};

const cart = {
  id: 'cart-1',
  items: [
    {
      productId: 'product-1',
      quantity: 2,
      product: {
        id: 'product-1',
        source: 'seller-listings',
        title: 'Seller lamp',
        price: new Prisma.Decimal('12.99'),
        sellerId: 'seller-1',
        listingStatus: 'PUBLISHED',
        stock: 5,
        seller: { displayName: 'Northlight Goods', userId: 'seller-user-1' },
      },
    },
  ],
};

const pendingOrder = {
  id: 'order-1',
  checkoutKey: '00000000-0000-4000-8000-000000000001',
  userId: 'buyer-1',
  status: 'PENDING_PAYMENT',
  paymentMethod: 'STRIPE',
  paymentStatus: 'PENDING',
  stockReserved: true,
  stripeSessionId: null,
  total: new Prisma.Decimal('25.98'),
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      productTitle: 'Seller lamp',
      quantity: 2,
      unitPrice: new Prisma.Decimal('12.99'),
      lineTotal: new Prisma.Decimal('25.98'),
      sellerId: 'seller-1',
      sellerName: 'Northlight Goods',
    },
  ],
};

const stripeClient = {
  checkout: {
    sessions: {
      create: stripeMocks.checkoutCreate,
      retrieve: stripeMocks.checkoutRetrieve,
      expire: stripeMocks.checkoutExpire,
    },
  },
};

const input = {
  checkoutKey: pendingOrder.checkoutKey,
  address: {
    name: 'Test Customer',
    line1: '123 Sample Street',
    line2: '',
    city: 'Testville',
    region: 'CA',
    postalCode: '90210',
    country: 'US',
  },
};

describe('Stripe checkout service', () => {
  beforeEach(() => {
    env.ALLOW_SYNTHETIC_CHECKOUT = false;
    vi.mocked(prisma.order.findUnique).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.order.findFirst)
      .mockReset()
      .mockResolvedValue({
        id: 'order-1',
        userId: 'buyer-1',
        status: 'PENDING_PAYMENT',
        stripeSessionId: 'cs_test_1',
        stockReserved: true,
      } as never);
    vi.mocked(prisma.order.updateMany)
      .mockReset()
      .mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$transaction)
      .mockReset()
      .mockImplementation(async (operation) => operation(transaction as never) as never);
    transaction.cart.findUnique.mockReset().mockResolvedValue(cart);
    transaction.order.create.mockReset().mockResolvedValue(pendingOrder);
    transaction.order.findUnique.mockReset().mockResolvedValue({
      stockReserved: true,
      items: [{ productId: 'product-1', quantity: 2 }],
    });
    transaction.order.updateMany.mockReset().mockResolvedValue({ count: 1 });
    transaction.$executeRaw.mockReset().mockResolvedValue(1);
    stripeMocks.checkoutCreate.mockReset().mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    stripeMocks.checkoutRetrieve.mockReset();
    stripeMocks.checkoutExpire.mockReset().mockResolvedValue({});
    stripeMocks.getStripeClient.mockReset().mockReturnValue(stripeClient);
  });

  it('prices line items from the seller database and reserves stock before returning Stripe Checkout', async () => {
    const result = await createStripeCheckoutSession('buyer-1', input);

    expect(result).toEqual({
      status: 'ready',
      orderId: 'order-1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      paymentStatus: 'PENDING',
    });
    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      }),
    );
    expect(transaction.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING_PAYMENT',
          paymentMethod: 'STRIPE',
          paymentStatus: 'PENDING',
          stockReserved: true,
          total: new Prisma.Decimal('25.98'),
          items: {
            create: [
              expect.objectContaining({
                unitPrice: new Prisma.Decimal('12.99'),
                sellerId: 'seller-1',
                sellerName: 'Northlight Goods',
              }),
            ],
          },
        }),
      }),
    );
    expect(stripeMocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Seller lamp' },
              unit_amount: 1299,
            },
            quantity: 2,
          },
        ],
      }),
      { idempotencyKey: 'brightshelf-order-order-1' },
    );
    expect(stripeMocks.checkoutCreate.mock.calls[0]?.[0]).toHaveProperty(
      'allowed_payment_method_types',
      ['card'],
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'PENDING_PAYMENT' },
      data: { stripeSessionId: 'cs_test_1' },
    });
  });

  it('rejects synthetic catalogue items without reserving stock', async () => {
    transaction.cart.findUnique.mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...cart.items[0],
          product: {
            ...cart.items[0].product,
            source: 'brightshelf-synthetic-demo',
            sellerId: null,
          },
        },
      ],
    });

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toEqual({
      status: 'ineligible',
      productIds: ['product-1'],
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();
  });

  it('allows synthetic checkout only with explicit non-production opt-in and reserves no stock', async () => {
    env.ALLOW_SYNTHETIC_CHECKOUT = true;
    transaction.cart.findUnique.mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...cart.items[0],
          product: {
            ...cart.items[0].product,
            source: 'brightshelf-synthetic-demo',
            sellerId: null,
            stock: 0,
            seller: null,
          },
        },
      ],
    });

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toMatchObject({
      status: 'ready',
    });

    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockReserved: false,
          items: {
            create: [
              expect.objectContaining({
                sellerId: null,
                sellerName: null,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('reserves imported real inventory and permits it without a seller profile', async () => {
    transaction.cart.findUnique.mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...cart.items[0],
          product: {
            ...cart.items[0].product,
            source: 'approved-inventory-feed',
            sellerId: null,
            stock: 4,
            seller: null,
          },
        },
      ],
    });

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toMatchObject({
      status: 'ready',
    });

    expect(transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(transaction.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stockReserved: true,
          items: {
            create: [
              expect.objectContaining({
                sellerId: null,
                sellerName: null,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('does not allow synthetic checkout in production even when opt-in is set', async () => {
    env.ALLOW_SYNTHETIC_CHECKOUT = true;
    env.NODE_ENV = 'production';
    transaction.cart.findUnique.mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...cart.items[0],
          product: {
            ...cart.items[0].product,
            source: 'brightshelf-synthetic-demo',
            sellerId: null,
            seller: null,
          },
        },
      ],
    });

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toEqual({
      status: 'ineligible',
      productIds: ['product-1'],
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();

    env.NODE_ENV = 'test';
  });

  it('prevents a seller from purchasing their own listing without reserving stock', async () => {
    transaction.cart.findUnique.mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...cart.items[0],
          product: {
            ...cart.items[0].product,
            seller: { displayName: 'Northlight Goods', userId: 'buyer-1' },
          },
        },
      ],
    });

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toEqual({
      status: 'own-listings',
      productIds: ['product-1'],
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('does not create an order when stock cannot be atomically reserved', async () => {
    transaction.$executeRaw.mockResolvedValueOnce(0);

    await expect(createStripeCheckoutSession('buyer-1', input)).resolves.toEqual({
      status: 'stock',
      productIds: [],
    });
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('releases stock after Stripe session creation fails and leaves the cart untouched', async () => {
    stripeMocks.checkoutCreate.mockRejectedValueOnce(new Error('Stripe is offline'));

    await expect(createStripeCheckoutSession('buyer-1', input)).rejects.toMatchObject({
      code: 'STRIPE_UNAVAILABLE',
      statusCode: 503,
    });

    expect(transaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', status: 'PENDING_PAYMENT', stockReserved: true },
        data: expect.objectContaining({
          status: 'PAYMENT_FAILED',
          paymentStatus: 'FAILED',
          stockReserved: false,
        }),
      }),
    );
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('reuses a pending order and Stripe idempotency key on an identical retry', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(pendingOrder as never);

    await createStripeCheckoutSession('buyer-1', input);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.order.create).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: 'brightshelf-order-order-1',
    });
  });

  it('expires a canceled hosted session and releases its stock reservation', async () => {
    stripeMocks.checkoutRetrieve.mockResolvedValueOnce({ id: 'cs_test_1', status: 'open' });
    stripeMocks.checkoutExpire.mockResolvedValueOnce({ id: 'cs_test_1', status: 'expired' });

    await expect(cancelStripeCheckout('buyer-1', 'order-1')).resolves.toEqual({
      status: 'canceled',
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', userId: 'buyer-1', paymentMethod: 'STRIPE' },
      select: { id: true, status: true, stripeSessionId: true, stockReserved: true },
    });
    expect(stripeMocks.checkoutExpire).toHaveBeenCalledWith('cs_test_1');
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
  });

  it('keeps the reservation when Stripe reports a completed session', async () => {
    stripeMocks.checkoutRetrieve.mockResolvedValueOnce({ id: 'cs_test_1', status: 'complete' });

    await expect(cancelStripeCheckout('buyer-1', 'order-1')).resolves.toEqual({
      status: 'pending',
    });
    expect(stripeMocks.checkoutExpire).not.toHaveBeenCalled();
    expect(transaction.order.updateMany).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
