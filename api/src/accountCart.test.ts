import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { signToken } from './lib/jwt';
import { prisma } from './lib/prisma';

const cartServices = vi.hoisted(() => ({
  addAccountCartItem: vi.fn(),
  clearAccountCart: vi.fn(),
  getAccountCart: vi.fn(),
  mergeGuestCart: vi.fn(),
  quoteGuestCart: vi.fn(),
  removeAccountCartItem: vi.fn(),
  replaceAccountCart: vi.fn(),
  updateAccountCartItem: vi.fn(),
}));

vi.mock('./lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('./services/cart', () => cartServices);

const user = {
  id: 'cart-owner-1',
  email: 'owner@example.test',
};
const cart = {
  items: [],
  unavailableProductIds: [],
  itemCount: 0,
  subtotal: 0,
};
const sessionId = 'cart-session-1';
const sessionCookie = `session=${signToken({ sub: user.id, jti: sessionId })}`;

describe('authenticated cart API', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(prisma.session.findUnique)
      .mockReset()
      .mockResolvedValue({
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        user,
      } as never);
    Object.values(cartServices).forEach((service) => service.mockReset());
    cartServices.getAccountCart.mockResolvedValue(cart);
    cartServices.replaceAccountCart.mockResolvedValue({ status: 'ok', cart });
    cartServices.mergeGuestCart.mockResolvedValue({ cart, rejectedProductIds: [] });
    cartServices.addAccountCartItem.mockResolvedValue({ status: 'ok', cart });
    cartServices.updateAccountCartItem.mockResolvedValue({ status: 'ok', cart });
    cartServices.removeAccountCartItem.mockResolvedValue(cart);
    cartServices.clearAccountCart.mockResolvedValue(cart);
  });

  it('requires a verified session before reading the account cart', async () => {
    const response = await request(app).get('/api/cart');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(cartServices.getAccountCart).not.toHaveBeenCalled();
  });

  it('loads only the cart for the user resolved from the signed session', async () => {
    const response = await request(app).get('/api/cart').set('Cookie', sessionCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cart);
    expect(cartServices.getAccountCart).toHaveBeenCalledWith(user.id);
  });

  it('validates replacement items before updating the account cart', async () => {
    const response = await request(app)
      .put('/api/cart')
      .set('Cookie', sessionCookie)
      .send({ items: [{ productId: 'product-1', quantity: 2 }] });

    expect(response.status).toBe(200);
    expect(cartServices.replaceAccountCart).toHaveBeenCalledWith(user.id, [
      { productId: 'product-1', quantity: 2 },
    ]);

    const invalidResponse = await request(app)
      .put('/api/cart')
      .set('Cookie', sessionCookie)
      .send({ items: [{ productId: 'product-1', quantity: 100 }] });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe('INVALID_CART');
  });

  it('merges guest items into the signed-in user cart and reports rejected items', async () => {
    const idempotencyKey = '00000000-0000-4000-8000-000000000001';
    cartServices.mergeGuestCart.mockResolvedValue({
      cart,
      rejectedProductIds: ['removed-product'],
    });

    const response = await request(app)
      .post('/api/cart/merge')
      .set('Cookie', sessionCookie)
      .send({
        items: [{ productId: 'product-1', quantity: 2 }],
        idempotencyKey,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cart,
      rejectedProductIds: ['removed-product'],
    });
    expect(cartServices.mergeGuestCart).toHaveBeenCalledWith(
      user.id,
      [{ productId: 'product-1', quantity: 2 }],
      idempotencyKey,
    );

    const missingKeyResponse = await request(app)
      .post('/api/cart/merge')
      .set('Cookie', sessionCookie)
      .send({ items: [] });
    expect(missingKeyResponse.status).toBe(400);
  });

  it('supports adding, setting quantity, removing and clearing account items', async () => {
    const addResponse = await request(app)
      .post('/api/cart/items')
      .set('Cookie', sessionCookie)
      .send({ productId: 'product-1', quantity: 2 });
    expect(addResponse.status).toBe(200);
    expect(cartServices.addAccountCartItem).toHaveBeenCalledWith(user.id, {
      productId: 'product-1',
      quantity: 2,
    });

    const updateResponse = await request(app)
      .patch('/api/cart/items/product-1')
      .set('Cookie', sessionCookie)
      .send({ quantity: 3 });
    expect(updateResponse.status).toBe(200);
    expect(cartServices.updateAccountCartItem).toHaveBeenCalledWith(user.id, 'product-1', 3);

    const removeResponse = await request(app)
      .delete('/api/cart/items/product-1')
      .set('Cookie', sessionCookie);
    expect(removeResponse.status).toBe(200);
    expect(cartServices.removeAccountCartItem).toHaveBeenCalledWith(user.id, 'product-1');

    const clearResponse = await request(app).delete('/api/cart').set('Cookie', sessionCookie);
    expect(clearResponse.status).toBe(200);
    expect(cartServices.clearAccountCart).toHaveBeenCalledWith(user.id);
  });

  it('returns explicit conflict errors for unavailable items and quantity limits', async () => {
    cartServices.addAccountCartItem.mockResolvedValueOnce({
      status: 'unavailable',
      productIds: ['removed-product'],
    });
    cartServices.updateAccountCartItem.mockResolvedValueOnce({ status: 'limit' });

    const addResponse = await request(app)
      .post('/api/cart/items')
      .set('Cookie', sessionCookie)
      .send({ productId: 'removed-product', quantity: 1 });
    expect(addResponse.status).toBe(409);
    expect(addResponse.body.error).toMatchObject({
      code: 'UNAVAILABLE_PRODUCTS',
      productIds: ['removed-product'],
    });

    const updateResponse = await request(app)
      .patch('/api/cart/items/product-1')
      .set('Cookie', sessionCookie)
      .send({ quantity: 99 });
    expect(updateResponse.status).toBe(409);
    expect(updateResponse.body.error.code).toBe('CART_LIMIT_REACHED');
  });
});
