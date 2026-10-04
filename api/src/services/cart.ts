import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { demoProductSource } from '../lib/demoCatalog';
import { serializeProduct } from './products';

export interface GuestCartInputItem {
  productId: string;
  quantity: number;
}

type CartProductAvailability = {
  source: string;
  sellerId: string | null;
  listingStatus: string;
  stock: number;
};

function isCartProductAvailable(product: CartProductAvailability, quantity: number): boolean {
  return (
    product.source === demoProductSource ||
    (product.listingStatus === 'PUBLISHED' && product.stock >= quantity)
  );
}

export async function quoteGuestCart(items: GuestCartInputItem[], userId?: string) {
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
    include: { seller: { select: { displayName: true, userId: true } } },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const quotedItems = [];
  const unavailableProductIds = [];
  let itemCount = 0;
  let subtotalCents = 0;

  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product || !isCartProductAvailable(product, item.quantity)) {
      unavailableProductIds.push(item.productId);
      continue;
    }

    const priceCents = Math.round(product.price.toNumber() * 100);
    const lineTotalCents = priceCents * item.quantity;
    quotedItems.push({
      product: userId
        ? {
            ...serializeProduct(product),
            isOwnListing: product.seller?.userId === userId,
          }
        : serializeProduct(product),
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

export type QuotedCart = Awaited<ReturnType<typeof quoteGuestCart>>;

export type CartMutationResult =
  | { status: 'ok'; cart: QuotedCart }
  | { status: 'unavailable'; productIds: string[] }
  | { status: 'limit' };

export async function getAccountCart(userId: string): Promise<QuotedCart> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      items: {
        select: { productId: true, quantity: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return quoteGuestCart(cart?.items ?? [], userId);
}

export async function replaceAccountCart(
  userId: string,
  items: GuestCartInputItem[],
): Promise<CartMutationResult> {
  const availableProducts = await prisma.product.findMany({
    where: { id: { in: items.map(({ productId }) => productId) } },
    select: { id: true, source: true, sellerId: true, listingStatus: true, stock: true },
  });
  const availableById = new Map(availableProducts.map((product) => [product.id, product]));
  const unavailableIds = items
    .filter((item) => {
      const product = availableById.get(item.productId);
      return !product || !isCartProductAvailable(product, item.quantity);
    })
    .map(({ productId }) => productId);

  if (unavailableIds.length > 0) {
    return { status: 'unavailable', productIds: unavailableIds };
  }

  await prisma.$transaction(async (transaction) => {
    const cart = await transaction.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (items.length > 0) {
      await transaction.cartItem.createMany({
        data: items.map(({ productId, quantity }) => ({
          cartId: cart.id,
          productId,
          quantity,
        })),
      });
    }
  });

  return { status: 'ok', cart: await getAccountCart(userId) };
}

export async function mergeGuestCart(
  userId: string,
  guestItems: GuestCartInputItem[],
  idempotencyKey: string,
): Promise<{ cart: QuotedCart; rejectedProductIds: string[] }> {
  let rejectedProductIds: string[];
  try {
    rejectedProductIds = await prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
      });
      const previousMerge = await transaction.cartMerge.findUnique({
        where: { idempotencyKey },
      });
      if (previousMerge) {
        if (previousMerge.cartId !== cart.id) {
          throw new Error('Cart merge key is already associated with another cart');
        }
        return previousMerge.rejectedProductIds;
      }

      await transaction.cartMerge.create({
        data: { idempotencyKey, cartId: cart.id },
      });
      const [products, existingItems] = await Promise.all([
        guestItems.length > 0
          ? transaction.product.findMany({
              where: { id: { in: guestItems.map(({ productId }) => productId) } },
              select: { id: true, source: true, sellerId: true, listingStatus: true, stock: true },
            })
          : Promise.resolve([]),
        transaction.cartItem.findMany({
          where: { cartId: cart.id },
          select: { productId: true, quantity: true },
        }),
      ]);
      const availableById = new Map(products.map((product) => [product.id, product]));
      const existingById = new Map(existingItems.map((item) => [item.productId, item]));
      let resultingCount = existingItems.length;
      const rejected: string[] = [];
      const upserts: Array<ReturnType<typeof transaction.cartItem.upsert>> = [];

      for (const item of guestItems) {
        const product = availableById.get(item.productId);
        if (!product) {
          rejected.push(item.productId);
          continue;
        }

        const existing = existingById.get(item.productId);
        if (!isCartProductAvailable(product, item.quantity + (existing?.quantity ?? 0))) {
          rejected.push(item.productId);
          continue;
        }
        if (existing) {
          const quantity = existing.quantity + item.quantity;
          if (quantity > 99) {
            rejected.push(item.productId);
            continue;
          }
          upserts.push(
            transaction.cartItem.upsert({
              where: {
                cartId_productId: { cartId: cart.id, productId: item.productId },
              },
              create: { cartId: cart.id, productId: item.productId, quantity },
              update: { quantity },
            }),
          );
          continue;
        }

        if (resultingCount >= 50) {
          rejected.push(item.productId);
          continue;
        }
        resultingCount += 1;
        upserts.push(
          transaction.cartItem.upsert({
            where: {
              cartId_productId: { cartId: cart.id, productId: item.productId },
            },
            create: {
              cartId: cart.id,
              productId: item.productId,
              quantity: item.quantity,
            },
            update: { quantity: item.quantity },
          }),
        );
      }

      await Promise.all(upserts);
      await transaction.cartMerge.update({
        where: { idempotencyKey },
        data: { rejectedProductIds: rejected },
      });
      return rejected;
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const previousMerge = await prisma.cartMerge.findUnique({
        where: { idempotencyKey },
        include: { cart: { select: { userId: true } } },
      });
      if (previousMerge?.cart.userId === userId) {
        return {
          cart: await getAccountCart(userId),
          rejectedProductIds: previousMerge.rejectedProductIds,
        };
      }
    }
    throw error;
  }

  return {
    cart: await getAccountCart(userId),
    rejectedProductIds,
  };
}

export async function addAccountCartItem(
  userId: string,
  item: GuestCartInputItem,
): Promise<CartMutationResult> {
  const product = await prisma.product.findUnique({
    where: { id: item.productId },
    select: { id: true, source: true, sellerId: true, listingStatus: true, stock: true },
  });
  if (!product || !isCartProductAvailable(product, item.quantity)) {
    return { status: 'unavailable', productIds: [item.productId] };
  }

  const result = await prisma.$transaction(async (transaction) => {
    const cart = await transaction.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    const [existing, itemCount] = await Promise.all([
      transaction.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
        select: { quantity: true },
      }),
      transaction.cartItem.count({ where: { cartId: cart.id } }),
    ]);
    if (existing && existing.quantity + item.quantity > 99) {
      return 'limit';
    }
    if (!isCartProductAvailable(product, item.quantity + (existing?.quantity ?? 0))) {
      return 'unavailable';
    }
    if (!existing && itemCount >= 50) {
      return 'limit';
    }
    await transaction.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
      create: { cartId: cart.id, productId: item.productId, quantity: item.quantity },
      update: { quantity: { increment: item.quantity } },
    });
    return 'ok';
  });

  if (result === 'limit') {
    return { status: 'limit' };
  }
  if (result === 'unavailable') {
    return { status: 'unavailable', productIds: [item.productId] };
  }
  return { status: 'ok', cart: await getAccountCart(userId) };
}

export async function updateAccountCartItem(
  userId: string,
  productId: string,
  quantity: number,
): Promise<CartMutationResult> {
  const [cart, product] = await Promise.all([
    prisma.cart.findUnique({ where: { userId }, select: { id: true } }),
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, source: true, sellerId: true, listingStatus: true, stock: true },
    }),
  ]);
  if (!product || !isCartProductAvailable(product, quantity)) {
    return { status: 'unavailable', productIds: [productId] };
  }
  if (!cart) {
    return { status: 'ok', cart: await getAccountCart(userId) };
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity },
    update: { quantity },
  });
  return { status: 'ok', cart: await getAccountCart(userId) };
}

export async function removeAccountCartItem(
  userId: string,
  productId: string,
): Promise<QuotedCart> {
  const cart = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });
  if (cart) {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
  }
  return getAccountCart(userId);
}

export async function clearAccountCart(userId: string): Promise<QuotedCart> {
  const cart = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
  return getAccountCart(userId);
}
