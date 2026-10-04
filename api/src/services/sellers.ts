import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface SellerListingInput {
  title: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  thumbnailUrl?: string | null;
  images?: string[];
}

export interface SellerListingUpdate {
  title?: string;
  description?: string;
  category?: string;
  priceCents?: number;
  stock?: number;
  thumbnailUrl?: string | null;
  images?: string[];
}

export async function activateSeller(userId: string, displayName: string) {
  return prisma.sellerProfile.upsert({
    where: { userId },
    create: { userId, displayName },
    update: { displayName },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getSellerProfile(userId: string) {
  return prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listSellerListings(sellerId: string, page: number, limit: number) {
  const where = { sellerId };
  const listingSelect = {
    id: true,
    title: true,
    description: true,
    category: true,
    price: true,
    stock: true,
    listingStatus: true,
    thumbnailUrl: true,
    images: true,
    createdAt: true,
    updatedAt: true,
  } as const;
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: listingSelect,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);
  const currentPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const currentRows =
    currentPage === page
      ? rows
      : await prisma.product.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (currentPage - 1) * limit,
          take: limit,
          select: listingSelect,
        });

  return {
    products: currentRows.map(serializeSellerListing),
    pagination: { page: currentPage, limit, total, totalPages },
  };
}

function serializeSellerListing(product: {
  id: string;
  title: string;
  description: string;
  category: string;
  price: Prisma.Decimal;
  stock: number;
  listingStatus: string;
  thumbnailUrl: string | null;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...product,
    price: product.price.toNumber(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function createSellerListing(sellerId: string, input: SellerListingInput) {
  return prisma.product
    .create({
      data: {
        source: 'seller',
        sourceId: randomUUID(),
        sellerId,
        listingStatus: 'DRAFT',
        title: input.title,
        description: input.description,
        category: input.category,
        price: new Prisma.Decimal(input.priceCents).dividedBy(100),
        stock: input.stock,
        thumbnailUrl: input.thumbnailUrl ?? null,
        images: input.images ?? [],
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        price: true,
        stock: true,
        listingStatus: true,
        thumbnailUrl: true,
        images: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    .then(serializeSellerListing);
}

export async function updateSellerListing(
  sellerId: string,
  productId: string,
  input: SellerListingUpdate,
) {
  const updateData = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.priceCents !== undefined
      ? { price: new Prisma.Decimal(input.priceCents).dividedBy(100) }
      : {}),
    ...(input.stock !== undefined ? { stock: input.stock } : {}),
    ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
    ...(input.images !== undefined ? { images: input.images } : {}),
  };
  const changed = await prisma.product.updateMany({
    where: { id: productId, sellerId, listingStatus: { not: 'ARCHIVED' } },
    data: updateData,
  });
  if (changed.count !== 1) {
    return null;
  }
  const product = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      price: true,
      stock: true,
      listingStatus: true,
      thumbnailUrl: true,
      images: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return product ? serializeSellerListing(product) : null;
}

export type ListingStatusResult =
  | { status: 'ok'; product: ReturnType<typeof serializeSellerListing> }
  | { status: 'not-found' }
  | { status: 'no-stock' }
  | { status: 'archived' };

export async function setSellerListingStatus(
  sellerId: string,
  productId: string,
  action: 'publish' | 'unpublish' | 'archive',
): Promise<ListingStatusResult> {
  const product = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: { stock: true, listingStatus: true },
  });
  if (!product) {
    return { status: 'not-found' };
  }
  if (product.listingStatus === 'ARCHIVED') {
    return { status: 'archived' };
  }
  if (action === 'publish' && product.stock < 1) {
    return { status: 'no-stock' };
  }

  const listingStatus =
    action === 'publish' ? 'PUBLISHED' : action === 'archive' ? 'ARCHIVED' : 'DRAFT';
  const changed = await prisma.product.updateMany({
    where: { id: productId, sellerId, listingStatus: { not: 'ARCHIVED' } },
    data: { listingStatus },
  });
  if (changed.count !== 1) {
    return { status: 'archived' };
  }

  const updated = await prisma.product.findFirst({
    where: { id: productId, sellerId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      price: true,
      stock: true,
      listingStatus: true,
      thumbnailUrl: true,
      images: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return updated
    ? { status: 'ok', product: serializeSellerListing(updated) }
    : { status: 'not-found' };
}
