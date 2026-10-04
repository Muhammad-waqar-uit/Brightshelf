import { Prisma, type Order, type OrderItem } from '@prisma/client';
import Stripe from 'stripe';
import { env } from '../lib/env';
import { demoProductSource } from '../lib/demoCatalog';
import { prisma } from '../lib/prisma';
import { getStripeClient } from '../lib/stripe';
import type { ShippingAddressInput } from './orders';

export interface StripeCheckoutInput {
  checkoutKey: string;
  address: ShippingAddressInput;
}

type StripeOrder = Order & { items: OrderItem[] };

export class CheckoutServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CheckoutServiceError';
  }
}

class StockReservationError extends Error {}

type PrepareOrderResult =
  | { status: 'ready'; order: StripeOrder }
  | { status: 'empty' }
  | { status: 'unavailable'; productIds: string[] }
  | { status: 'ineligible'; productIds: string[] }
  | { status: 'own-listings'; productIds: string[] }
  | { status: 'stock'; productIds: string[] }
  | { status: 'amount-limit' }
  | { status: 'key-conflict' }
  | { status: 'terminal'; orderId: string };

const MAX_CHECKOUT_TOTAL_CENTS = 99_999_999;

function amountInCents(amount: Prisma.Decimal): number {
  return Math.round(amount.toNumber() * 100);
}

async function reserveProductStock(
  transaction: Prisma.TransactionClient,
  items: Array<{ productId: string; quantity: number }>,
): Promise<void> {
  const reservationData = JSON.stringify(items);
  const reservedCount = await transaction.$executeRaw`
    UPDATE "products" AS product
    SET "stock" = product."stock" - reservation."quantity"
    FROM jsonb_to_recordset(${reservationData}::jsonb)
      AS reservation("productId" text, "quantity" integer)
    WHERE product."id" = reservation."productId"
      AND product."source" <> ${demoProductSource}
      AND product."listingStatus" = 'PUBLISHED'::"ListingStatus"
      AND product."stock" >= reservation."quantity"
  `;
  if (reservedCount !== items.length) {
    throw new StockReservationError('Seller listing stock changed during checkout');
  }
}

async function releaseProductStock(
  transaction: Prisma.TransactionClient,
  items: Array<{ productId: string; quantity: number }>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const reservationData = JSON.stringify(items);
  await transaction.$executeRaw`
    UPDATE "products" AS product
    SET "stock" = product."stock" + reservation."quantity"
    FROM jsonb_to_recordset(${reservationData}::jsonb)
      AS reservation("productId" text, "quantity" integer)
    WHERE product."id" = reservation."productId"
      AND product."source" <> ${demoProductSource}
  `;
}

async function prepareOrder(
  userId: string,
  input: StripeCheckoutInput,
): Promise<PrepareOrderResult> {
  const existing = await prisma.order.findUnique({
    where: { checkoutKey: input.checkoutKey },
    include: { items: true },
  });
  if (existing) {
    if (existing.userId !== userId) {
      return { status: 'key-conflict' };
    }
    if (existing.status !== 'PENDING_PAYMENT' || existing.paymentMethod !== 'STRIPE') {
      return { status: 'terminal', orderId: existing.id };
    }
    return { status: 'ready', order: existing };
  }

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const cart = await transaction.cart.findUnique({
          where: { userId },
          select: {
            id: true,
            items: {
              select: {
                productId: true,
                quantity: true,
                product: {
                  select: {
                    id: true,
                    source: true,
                    title: true,
                    price: true,
                    sellerId: true,
                    listingStatus: true,
                    stock: true,
                    seller: { select: { displayName: true, userId: true } },
                  },
                },
              },
            },
          },
        });
        if (!cart || cart.items.length === 0) {
          return { status: 'empty' as const };
        }

        const unavailable = cart.items.filter((item) => !item.product);
        if (unavailable.length > 0) {
          return {
            status: 'unavailable' as const,
            productIds: unavailable.map(({ productId }) => productId),
          };
        }
        const syntheticItems = cart.items.filter(
          (item) => item.product?.source === demoProductSource,
        );
        const syntheticCheckoutEnabled =
          env.ALLOW_SYNTHETIC_CHECKOUT && env.NODE_ENV !== 'production';
        const ineligible = syntheticCheckoutEnabled ? [] : syntheticItems;
        if (ineligible.length > 0) {
          return {
            status: 'ineligible' as const,
            productIds: ineligible.map(({ productId }) => productId),
          };
        }
        const ownListings = cart.items.filter(({ product }) => product?.seller?.userId === userId);
        if (ownListings.length > 0) {
          return {
            status: 'own-listings' as const,
            productIds: ownListings.map(({ productId }) => productId),
          };
        }
        const unavailableListings = cart.items.filter(
          ({ product }) => product?.listingStatus !== 'PUBLISHED',
        );
        if (unavailableListings.length > 0) {
          return {
            status: 'unavailable' as const,
            productIds: unavailableListings.map(({ productId }) => productId),
          };
        }
        const outOfStock = cart.items.filter(
          ({ product, quantity }) =>
            product?.source !== demoProductSource && (!product || product.stock < quantity),
        );
        if (outOfStock.length > 0) {
          return {
            status: 'stock' as const,
            productIds: outOfStock.map(({ productId }) => productId),
          };
        }

        const products = cart.items.map((item) => {
          const product = item.product;
          if (!product) {
            throw new Error('A cart product disappeared while preparing checkout');
          }
          if (product.source !== demoProductSource && product.sellerId && !product.seller) {
            throw new Error('A seller product is missing its seller profile');
          }
          const unitPriceCents = amountInCents(product.price);
          return {
            productId: product.id,
            title: product.title,
            quantity: item.quantity,
            unitPriceCents,
            lineTotalCents: unitPriceCents * item.quantity,
            sellerId: product.sellerId,
            sellerName: product.seller?.displayName ?? null,
            isSyntheticDemo: product.source === demoProductSource,
          };
        });
        const totalCents = products.reduce((sum, item) => sum + item.lineTotalCents, 0);
        if (totalCents > MAX_CHECKOUT_TOTAL_CENTS) {
          return { status: 'amount-limit' as const };
        }

        const reservableProducts = products.filter((product) => !product.isSyntheticDemo);
        if (reservableProducts.length > 0) {
          await reserveProductStock(
            transaction,
            reservableProducts.map(({ productId, quantity }) => ({ productId, quantity })),
          );
        }
        const total = new Prisma.Decimal(totalCents).dividedBy(100);
        const order = await transaction.order.create({
          data: {
            checkoutKey: input.checkoutKey,
            userId,
            status: 'PENDING_PAYMENT',
            paymentMethod: 'STRIPE',
            paymentStatus: 'PENDING',
            subtotal: total,
            shipping: 0,
            total,
            shippingName: input.address.name,
            shippingAddressLine1: input.address.line1,
            shippingAddressLine2: input.address.line2 || null,
            shippingCity: input.address.city,
            shippingRegion: input.address.region,
            shippingPostalCode: input.address.postalCode,
            shippingCountry: input.address.country,
            stockReserved: reservableProducts.length > 0,
            items: {
              create: products.map((item) => ({
                productId: item.productId,
                productTitle: item.title,
                quantity: item.quantity,
                unitPrice: new Prisma.Decimal(item.unitPriceCents).dividedBy(100),
                lineTotal: new Prisma.Decimal(item.lineTotalCents).dividedBy(100),
                sellerId: item.sellerId,
                sellerName: item.sellerName,
              })),
            },
          },
          include: { items: true },
        });
        return { status: 'ready' as const, order };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      },
    );
  } catch (error: unknown) {
    if (error instanceof StockReservationError) {
      return { status: 'stock', productIds: [] };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return { status: 'stock', productIds: [] };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.order.findUnique({
        where: { checkoutKey: input.checkoutKey },
        include: { items: true },
      });
      if (duplicate?.userId === userId && duplicate.status === 'PENDING_PAYMENT') {
        return { status: 'ready', order: duplicate };
      }
      if (duplicate) {
        return { status: 'key-conflict' };
      }
    }
    throw error;
  }
}

async function releaseOrderReservation(
  orderId: string,
  finalStatus: 'PAYMENT_FAILED' | 'CANCELED' = 'PAYMENT_FAILED',
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      select: { stockReserved: true, items: { select: { productId: true, quantity: true } } },
    });
    if (!order) {
      return;
    }
    const changed = await transaction.order.updateMany({
      where: {
        id: orderId,
        status: 'PENDING_PAYMENT',
        ...(order.stockReserved ? { stockReserved: true } : {}),
      },
      data: {
        status: finalStatus,
        paymentStatus: finalStatus === 'CANCELED' ? 'CANCELED' : 'FAILED',
        stockReserved: false,
        reservationReleasedAt: new Date(),
      },
    });
    if (changed.count === 1 && order.stockReserved) {
      const reservationItems = order.items.flatMap((item) =>
        item.productId ? [{ productId: item.productId, quantity: item.quantity }] : [],
      );
      await releaseProductStock(transaction, reservationItems);
    }
  });
}

function checkoutUrls(orderId: string) {
  const webOrigin = env.WEB_ORIGIN.replace(/\/$/, '');
  return {
    successUrl: `${webOrigin}/orders/${encodeURIComponent(orderId)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${webOrigin}/checkout?payment=canceled&order_id=${encodeURIComponent(orderId)}`,
  };
}

async function createStripeSession(
  stripe: Stripe,
  order: StripeOrder,
): Promise<Stripe.Checkout.Session> {
  const urls = checkoutUrls(order.id);
  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      line_items: order.items.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: { name: item.productTitle },
          unit_amount: amountInCents(item.unitPrice),
        },
        quantity: item.quantity,
      })),
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      metadata: { orderId: order.id, userId: order.userId },
      client_reference_id: order.id,
    },
    { idempotencyKey: `brightshelf-order-${order.id}` },
  );
}

export async function createStripeCheckoutSession(userId: string, input: StripeCheckoutInput) {
  const stripe = getStripeClient();
  const prepared = await prepareOrder(userId, input);
  if (prepared.status !== 'ready') {
    return prepared;
  }

  const order = prepared.order;
  if (order.stripeSessionId) {
    const existingSession = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    if (existingSession.url) {
      return {
        status: 'ready' as const,
        orderId: order.id,
        checkoutUrl: existingSession.url,
        paymentStatus: order.paymentStatus,
      };
    }
  }

  let session: Stripe.Checkout.Session | null = null;
  try {
    session = await createStripeSession(stripe, order);
    if (!session.url) {
      throw new Error('Stripe did not return a hosted Checkout URL');
    }
    await prisma.order.updateMany({
      where: { id: order.id, status: 'PENDING_PAYMENT' },
      data: { stripeSessionId: session.id },
    });
    return {
      status: 'ready' as const,
      orderId: order.id,
      checkoutUrl: session.url,
      paymentStatus: order.paymentStatus,
    };
  } catch (error: unknown) {
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        throw new CheckoutServiceError(
          'CHECKOUT_SESSION_UNCERTAIN',
          'Checkout session status could not be confirmed. Contact support before retrying.',
          503,
        );
      }
    }
    await releaseOrderReservation(order.id);
    if (error instanceof CheckoutServiceError) {
      throw error;
    }
    throw new CheckoutServiceError(
      'STRIPE_UNAVAILABLE',
      'Secure checkout is temporarily unavailable. Your cart has been kept.',
      503,
    );
  }
}

export async function cancelStripeCheckout(userId: string, orderId: string) {
  const stripe = getStripeClient();
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId, paymentMethod: 'STRIPE' },
    select: { id: true, status: true, stripeSessionId: true, stockReserved: true },
  });
  if (!order) {
    return { status: 'not-found' as const };
  }
  if (order.status === 'PAID') {
    return { status: 'paid' as const };
  }
  if (order.status === 'CANCELED') {
    return { status: 'canceled' as const };
  }
  if (order.status === 'PAYMENT_FAILED') {
    return { status: 'failed' as const };
  }
  if (order.status !== 'PENDING_PAYMENT' || !order.stripeSessionId) {
    return { status: 'pending' as const };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    if (session.status === 'open') {
      try {
        session = await stripe.checkout.sessions.expire(order.stripeSessionId);
      } catch {
        session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      }
    }
  } catch {
    throw new CheckoutServiceError(
      'CHECKOUT_CANCEL_UNCONFIRMED',
      'Stripe could not confirm checkout cancellation. Your stock reservation remains protected.',
      503,
    );
  }

  if (session.status === 'complete') {
    return { status: 'pending' as const };
  }
  if (session.status !== 'expired') {
    throw new CheckoutServiceError(
      'CHECKOUT_CANCEL_UNCONFIRMED',
      'Stripe could not confirm checkout cancellation. Your stock reservation remains protected.',
      503,
    );
  }

  await releaseOrderReservation(order.id, 'CANCELED');
  return { status: 'canceled' as const };
}
