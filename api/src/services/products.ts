import { prisma } from '../lib/prisma';

export function serializeProduct(product: {
  id: string;
  title: string;
  description: string;
  category: string;
  price: { toNumber: () => number };
  thumbnailUrl: string | null;
  images: string[];
  brand: string | null;
}) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.price.toNumber(),
    thumbnailUrl: product.thumbnailUrl,
    images: product.images,
    brand: product.brand,
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
  const where = {
    ...(search.category ? { category: search.category } : {}),
    ...(search.q
      ? {
          OR: [
            { title: { contains: search.q, mode: 'insensitive' as const } },
            { brand: { contains: search.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
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
  const product = await prisma.product.findUnique({ where: { id } });
  return product ? serializeProduct(product) : null;
}
