import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { signToken } from './lib/jwt';
import { prisma } from './lib/prisma';

const orderServices = vi.hoisted(() => ({
  getOrder: vi.fn(),
  listOrders: vi.fn(),
  listSellerSales: vi.fn(),
}));

vi.mock('./lib/prisma', () => ({
  prisma: { session: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));

vi.mock('./services/orders', () => orderServices);

const user = { id: 'order-owner-1', email: 'orders@example.test' };
const order = {
  id: 'order-1',
  status: 'PLACED',
  paymentMethod: 'SIMULATED',
  paymentStatus: 'NOT_REQUIRED',
  subtotal: 25,
  shipping: 0,
  total: 25,
  items: [],
};
const sessionId = 'orders-session-1';
const cookie = `session=${signToken({ sub: user.id, jti: sessionId })}`;

describe('orders API', () => {
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
    Object.values(orderServices).forEach((service) => service.mockReset());
    orderServices.listOrders.mockResolvedValue({ orders: [], nextCursor: null });
    orderServices.getOrder.mockResolvedValue(order);
  });

  it('disables the legacy simulated-payment endpoint', async () => {
    const unauthenticated = await request(app).post('/api/orders').send({});
    expect(unauthenticated.status).toBe(401);

    const response = await request(app).post('/api/orders').set('Cookie', cookie).send({});
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('PAYMENT_FLOW_REPLACED');
  });

  it('returns bounded owner-scoped history and detail', async () => {
    const list = await request(app).get('/api/orders?limit=5').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(orderServices.listOrders).toHaveBeenCalledWith(user.id, { limit: 5 });

    const detail = await request(app).get('/api/orders/order-1').set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(orderServices.getOrder).toHaveBeenCalledWith(user.id, 'order-1');

    orderServices.getOrder.mockResolvedValueOnce(null);
    const otherUsersOrder = await request(app)
      .get('/api/orders/other-users-order')
      .set('Cookie', cookie);
    expect(otherUsersOrder.status).toBe(404);
    expect(otherUsersOrder.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});
