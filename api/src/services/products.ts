import { Prisma } from '@prisma/client';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { demoProductSource } from '../lib/demoCatalog';

export function serializeProduct(product: {
  id: string;
  source: string;
  title: string;
  description: string;
  category: string;
  price: { toNumber: () => number };
  thumbnailUrl: string | null;
  images: string[];
  brand: string | null;
  sellerId?: string | null;
  stock?: number;
  seller?: { displayName: string } | null;
}) {
  return {
    id: product.id,
    isSyntheticDemo: product.source === demoProductSource,
    syntheticCheckoutEnabled:
      product.source === demoProductSource &&
      env.ALLOW_SYNTHETIC_CHECKOUT &&
      env.NODE_ENV !== 'production',
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.price.toNumber(),
    thumbnailUrl: product.thumbnailUrl,
    images: product.images,
    brand: product.brand,
    stock: product.source === demoProductSource ? null : (product.stock ?? null),
    sellerName: product.seller?.displayName ?? null,
  };
}

export interface ProductSearch {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: 'newest' | 'price-asc' | 'price-desc';
  page: number;
  limit: number;
}

export async function listProducts(search: ProductSearch) {
  const where: Prisma.ProductWhereInput = {
    AND: [
      {
        OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' as const }],
      },
      ...(search.q
        ? [
            {
              OR: [
                { title: { contains: search.q, mode: 'insensitive' as const } },
                { brand: { contains: search.q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ],
    ...(search.category ? { category: search.category } : {}),
    ...(search.minPrice !== undefined || search.maxPrice !== undefined
      ? {
          price: {
            ...(search.minPrice !== undefined ? { gte: search.minPrice } : {}),
            ...(search.maxPrice !== undefined ? { lte: search.maxPrice } : {}),
          },
        }
      : {}),
  };
  const orderBy =
    search.sort === 'price-asc'
      ? [{ price: 'asc' as const }, { createdAt: 'desc' as const }]
      : search.sort === 'price-desc'
        ? [{ price: 'desc' as const }, { createdAt: 'desc' as const }]
        : { createdAt: 'desc' as const };
  const total = await prisma.product.count({ where });
  const totalPages = Math.ceil(total / search.limit);
  const page = totalPages === 0 ? 1 : Math.min(search.page, totalPages);
  const orderedBy = Array.isArray(orderBy)
    ? [...orderBy, { id: 'desc' as const }]
    : [orderBy, { id: 'desc' as const }];
  const products = await prisma.product.findMany({
    where,
    orderBy: orderedBy,
    skip: (page - 1) * search.limit,
    take: search.limit,
    include: { seller: { select: { displayName: true } } },
  });

  return {
    products: products.map(serializeProduct),
    pagination: {
      page,
      limit: search.limit,
      total,
      totalPages,
    },
  };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: {
      id,
      OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' as const }],
    },
    include: { seller: { select: { displayName: true } } },
  });
  return product ? serializeProduct(product) : null;
}

export async function getProductCategories() {
  const categories = await prisma.product.findMany({
    where: {
      OR: [{ sellerId: null }, { sellerId: { not: null }, listingStatus: 'PUBLISHED' as const }],
    },
    distinct: ['category'],
    orderBy: { category: 'asc' },
    select: { category: true },
  });
  return categories.map(({ category }) => category);
}
