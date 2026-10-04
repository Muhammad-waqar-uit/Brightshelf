import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { signToken } from './lib/jwt';
import { prisma } from './lib/prisma';

const checkoutService = vi.hoisted(() => ({
  cancelStripeCheckout: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
}));

vi.mock('./lib/prisma', () => ({
  prisma: { session: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));
vi.mock('./services/stripeCheckout', () => checkoutService);

const user = { id: 'buyer-1', email: 'buyer@example.test' };
const sessionId = 'checkout-session-1';
const cookie = `session=${signToken({ sub: user.id, jti: sessionId })}`;
const input = {
  checkoutKey: '00000000-0000-4000-8000-000000000001',
  address: {
    name: 'Test Customer',
    line1: '123 Sample Street',
    city: 'Testville',
    region: 'CA',
    postalCode: '90210',
    country: 'us',
  },
};

describe('POST /api/checkout/session', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique)
      .mockReset()
      .mockResolvedValue(user as never);
    vi.mocked(prisma.session.findUnique)
      .mockReset()
      .mockResolvedValue({
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        user,
      } as never);
    checkoutService.createStripeCheckoutSession.mockReset();
    checkoutService.cancelStripeCheckout.mockReset().mockResolvedValue({ status: 'canceled' });
    checkoutService.createStripeCheckoutSession.mockResolvedValue({
      status: 'ready',
      orderId: 'order-1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
      paymentStatus: 'PENDING',
    });
  });

  it('requires a session and validates the delivery address', async () => {
    const unauthenticated = await request(app).post('/api/checkout/session').send(input);
    expect(unauthenticated.status).toBe(401);

    const invalid = await request(app)
      .post('/api/checkout/session')
      .set('Cookie', cookie)
      .send({ ...input, address: { ...input.address, line1: '' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_CHECKOUT');
    expect(checkoutService.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates a checkout session for the verified user using only validated delivery details', async () => {
    const response = await request(app)
      .post('/api/checkout/session')
      .set('Cookie', cookie)
      .send(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      orderId: 'order-1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
      paymentStatus: 'PENDING',
    });
    expect(checkoutService.createStripeCheckoutSession).toHaveBeenCalledWith(user.id, {
      checkoutKey: input.checkoutKey,
      address: {
        name: 'Test Customer',
        line1: '123 Sample Street',
        line2: '',
        city: 'Testville',
        region: 'CA',
        postalCode: '90210',
        country: 'US',
      },
    });
  });

  it('rejects synthetic demo products with an explicit conflict', async () => {
    checkoutService.createStripeCheckoutSession.mockResolvedValueOnce({
      status: 'ineligible',
      productIds: ['demo-product'],
    });
    const response = await request(app)
      .post('/api/checkout/session')
      .set('Cookie', cookie)
      .send(input);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DEMO_ITEMS_NOT_PURCHASABLE');
  });

  it('rejects seller self-purchases with an explicit conflict', async () => {
    checkoutService.createStripeCheckoutSession.mockResolvedValueOnce({
      status: 'own-listings',
      productIds: ['seller-product'],
    });
    const response = await request(app)
      .post('/api/checkout/session')
      .set('Cookie', cookie)
      .send(input);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SELF_PURCHASE_NOT_ALLOWED');
    expect(response.body.error.productIds).toEqual(['seller-product']);
  });

  it('cancels only the current buyer checkout using the verified session identity', async () => {
    const response = await request(app).post('/api/checkout/order-1/cancel').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'canceled' });
    expect(checkoutService.cancelStripeCheckout).toHaveBeenCalledWith(user.id, 'order-1');

    checkoutService.cancelStripeCheckout.mockResolvedValueOnce({ status: 'not-found' });
    const foreignOrder = await request(app)
      .post('/api/checkout/other-order/cancel')
      .set('Cookie', cookie);
    expect(foreignOrder.status).toBe(404);
    expect(foreignOrder.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});
