import { prisma } from '../lib/prisma';
import { serializeProduct } from './products';

export interface GuestCartInputItem {
  productId: string;
  quantity: number;
}

export async function quoteGuestCart(items: GuestCartInputItem[]) {
  if (items.length === 0) {
    return {
      items: [],
      unavailableProductIds: [],
      itemCount: 0,
      subtotal: 0,
    };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map(({ productId }) => productId) } },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const quotedItems = [];
  const unavailableProductIds = [];
  let itemCount = 0;
  let subtotalCents = 0;

  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product) {
      unavailableProductIds.push(item.productId);
      continue;
    }

    const priceCents = Math.round(product.price.toNumber() * 100);
    const lineTotalCents = priceCents * item.quantity;
    quotedItems.push({
      product: serializeProduct(product),
      quantity: item.quantity,
      lineTotal: lineTotalCents / 100,
    });
    itemCount += item.quantity;
    subtotalCents += lineTotalCents;
  }

  return {
    items: quotedItems,
    unavailableProductIds,
    itemCount,
    subtotal: subtotalCents / 100,
  };
}
