import { prisma } from '../lib/prisma';

export async function listProducts(limit: number) {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return products.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category,
    price: Number(product.price),
    thumbnailUrl: product.thumbnailUrl,
    images: product.images,
    brand: product.brand,
  }));
}
