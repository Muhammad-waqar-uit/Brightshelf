import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { signToken } from './lib/jwt';
import { prisma } from './lib/prisma';

const sellerServices = vi.hoisted(() => ({
  activateSeller: vi.fn(),
  createSellerListing: vi.fn(),
  getSellerProfile: vi.fn(),
  listSellerListings: vi.fn(),
  setSellerListingStatus: vi.fn(),
  updateSellerListing: vi.fn(),
}));
const orderServices = vi.hoisted(() => ({ listSellerSales: vi.fn() }));

vi.mock('./lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('./services/sellers', () => sellerServices);
vi.mock('./services/orders', () => orderServices);

const user = { id: 'seller-owner-1', email: 'seller@example.test' };
const profile = {
  id: 'seller-profile-1',
  displayName: 'Bright Shelf Studio',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
};
const product = {
  id: 'seller-product-1',
  title: 'Handmade desk tray',
  description: 'A simple storage tray.',
  category: 'Home',
  price: 12.5,
  stock: 4,
  listingStatus: 'DRAFT',
};
const sessionId = 'seller-session-1';
const sessionCookie = `session=${signToken({ sub: user.id, jti: sessionId })}`;
const listingInput = {
  title: product.title,
  description: product.description,
  category: product.category,
  priceCents: 1250,
  stock: 4,
};

describe('seller profile and listing API', () => {
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
    Object.values(sellerServices).forEach((service) => service.mockReset());
    orderServices.listSellerSales.mockReset().mockResolvedValue({
      sales: [],
      page: 1,
      limit: 20,
      hasMore: false,
    });
    sellerServices.activateSeller.mockResolvedValue(profile);
    sellerServices.getSellerProfile.mockResolvedValue(profile);
    sellerServices.listSellerListings.mockResolvedValue({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    sellerServices.createSellerListing.mockResolvedValue(product);
    sellerServices.updateSellerListing.mockResolvedValue(product);
    sellerServices.setSellerListingStatus.mockResolvedValue({ status: 'ok', product });
  });

  it('requires a verified user and validates seller activation input', async () => {
    const unauthenticated = await request(app)
      .post('/api/seller/profile')
      .send({ displayName: 'Bright Shelf Studio' });
    expect(unauthenticated.status).toBe(401);

    const invalid = await request(app)
      .post('/api/seller/profile')
      .set('Cookie', sessionCookie)
      .send({ displayName: ' ' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_SELLER_PROFILE');
    expect(sellerServices.activateSeller).not.toHaveBeenCalled();

    const activated = await request(app)
      .post('/api/seller/profile')
      .set('Cookie', sessionCookie)
      .send({ displayName: ' Bright Shelf Studio ' });
    expect(activated.status).toBe(200);
    expect(activated.body.profile).toEqual(profile);
    expect(sellerServices.activateSeller).toHaveBeenCalledWith(user.id, 'Bright Shelf Studio');
  });

  it('uses the session seller profile for listing reads and creation', async () => {
    const list = await request(app)
      .get('/api/seller/products?page=2&limit=10')
      .set('Cookie', sessionCookie);
    expect(list.status).toBe(200);
    expect(sellerServices.listSellerListings).toHaveBeenCalledWith(profile.id, 2, 10);

    const created = await request(app)
      .post('/api/seller/products')
      .set('Cookie', sessionCookie)
      .send(listingInput);
    expect(created.status).toBe(201);
    expect(sellerServices.createSellerListing).toHaveBeenCalledWith(profile.id, listingInput);

    const forgedOwner = await request(app)
      .post('/api/seller/products')
      .set('Cookie', sessionCookie)
      .send({ ...listingInput, sellerId: 'another-seller' });
    expect(forgedOwner.status).toBe(400);
    expect(sellerServices.createSellerListing).toHaveBeenCalledTimes(1);
  });

  it('returns a bounded sales summary scoped to the active seller profile', async () => {
    const response = await request(app)
      .get('/api/seller/sales?page=2&limit=10')
      .set('Cookie', sessionCookie);

    expect(response.status).toBe(200);
    expect(orderServices.listSellerSales).toHaveBeenCalledWith(profile.id, 2, 10);

    const unauthenticated = await request(app).get('/api/seller/sales');
    expect(unauthenticated.status).toBe(401);
  });

  it('rejects listing operations until the authenticated user activates seller access', async () => {
    sellerServices.getSellerProfile.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/seller/products')
      .set('Cookie', sessionCookie)
      .send(listingInput);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SELLER_PROFILE_REQUIRED');
    expect(sellerServices.createSellerListing).not.toHaveBeenCalled();
  });

  it('validates product fields and maps non-owned listing IDs to not found', async () => {
    const invalid = await request(app)
      .post('/api/seller/products')
      .set('Cookie', sessionCookie)
      .send({ ...listingInput, priceCents: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_LISTING');

    sellerServices.updateSellerListing.mockResolvedValueOnce(null);
    const foreignListing = await request(app)
      .patch('/api/seller/products/another-seller-product')
      .set('Cookie', sessionCookie)
      .send({ title: 'Attempted takeover' });
    expect(foreignListing.status).toBe(404);
    expect(foreignListing.body.error.code).toBe('LISTING_NOT_FOUND');
    expect(sellerServices.updateSellerListing).toHaveBeenCalledWith(
      profile.id,
      'another-seller-product',
      { title: 'Attempted takeover' },
    );
    const excessivePrice = await request(app)
      .post('/api/seller/products')
      .set('Cookie', sessionCookie)
      .send({ ...listingInput, priceCents: 100_000_000 });
    expect(excessivePrice.status).toBe(400);
  });

  it('requires stock before publishing and permits unpublishing or archiving owned listings', async () => {
    sellerServices.setSellerListingStatus.mockResolvedValueOnce({ status: 'no-stock' });
    const noStock = await request(app)
      .post('/api/seller/products/seller-product-1/publish')
      .set('Cookie', sessionCookie);
    expect(noStock.status).toBe(409);
    expect(noStock.body.error.code).toBe('LISTING_OUT_OF_STOCK');

    const unpublished = await request(app)
      .post('/api/seller/products/seller-product-1/unpublish')
      .set('Cookie', sessionCookie);
    expect(unpublished.status).toBe(200);
    expect(sellerServices.setSellerListingStatus).toHaveBeenLastCalledWith(
      profile.id,
      'seller-product-1',
      'unpublish',
    );
  });
});
