import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  activateSeller,
  createSellerListing,
  setSellerListingStatus,
  updateSellerListing,
} from './sellers';

const database = vi.hoisted(() => ({
  sellerProfile: { upsert: vi.fn() },
  product: {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../lib/prisma', () => ({ prisma: database }));

const savedListing = {
  id: 'listing-1',
  title: 'Handmade desk tray',
  description: 'A simple storage tray.',
  category: 'Home',
  price: new Prisma.Decimal('12.50'),
  stock: 4,
  listingStatus: 'DRAFT',
  createdAt: new Date('2026-10-07T00:00:00.000Z'),
  updatedAt: new Date('2026-10-07T00:00:00.000Z'),
};

describe('seller services', () => {
  beforeEach(() => {
    vi.mocked(prisma.sellerProfile.upsert)
      .mockReset()
      .mockResolvedValue({
        id: 'seller-1',
        userId: 'user-1',
        displayName: 'Bright Shelf Studio',
        createdAt: savedListing.createdAt,
        updatedAt: savedListing.updatedAt,
      } as never);
    vi.mocked(prisma.product.create)
      .mockReset()
      .mockResolvedValue(savedListing as never);
    vi.mocked(prisma.product.findFirst)
      .mockReset()
      .mockResolvedValue(savedListing as never);
    vi.mocked(prisma.product.updateMany).mockReset().mockResolvedValue({ count: 1 });
  });

  it('creates or updates seller activation for the authenticated user only', async () => {
    await activateSeller('user-1', 'Bright Shelf Studio');

    expect(prisma.sellerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', displayName: 'Bright Shelf Studio' },
      update: { displayName: 'Bright Shelf Studio' },
      select: {
        id: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('creates a draft seller product using integer cents and zero client-controlled ownership', async () => {
    const result = await createSellerListing('seller-1', {
      title: savedListing.title,
      description: savedListing.description,
      category: savedListing.category,
      priceCents: 1250,
      stock: 4,
    });

    expect(result).toMatchObject({
      id: 'listing-1',
      price: 12.5,
      stock: 4,
      listingStatus: 'DRAFT',
    });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'seller',
          sellerId: 'seller-1',
          listingStatus: 'DRAFT',
          price: new Prisma.Decimal('12.5'),
        }),
      }),
    );
  });

  it('scopes listing updates by both listing ID and seller profile', async () => {
    await updateSellerListing('seller-1', 'listing-1', { title: 'Updated title' });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'listing-1', sellerId: 'seller-1', listingStatus: { not: 'ARCHIVED' } },
      data: { title: 'Updated title' },
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'listing-1', sellerId: 'seller-1' },
      }),
    );
  });

  it('does not publish a listing with zero stock', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce({
      stock: 0,
      listingStatus: 'DRAFT',
    } as never);

    await expect(setSellerListingStatus('seller-1', 'listing-1', 'publish')).resolves.toEqual({
      status: 'no-stock',
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('does not mutate an archived listing', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce({
      stock: 10,
      listingStatus: 'ARCHIVED',
    } as never);

    await expect(setSellerListingStatus('seller-1', 'listing-1', 'publish')).resolves.toEqual({
      status: 'archived',
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });
});
