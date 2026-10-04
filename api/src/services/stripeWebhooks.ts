import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { demoProductSource } from '../lib/demoCatalog';
import { prisma } from '../lib/prisma';

type CheckoutOutcome = 'paid' | 'canceled' | 'failed' | null;

function getCheckoutOutcome(event: Stripe.Event): CheckoutOutcome {
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    return 'paid';
  }
  if (event.type === 'checkout.session.expired') {
    return 'canceled';
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    return 'failed';
  }
  return null;
}

function isPaidSessionEvent(event: Stripe.Event): boolean {
  return (
    (event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded') &&
    (event.data.object as Stripe.Checkout.Session).payment_status === 'paid'
  );
}

async function restoreReservedStock(
  transaction: Prisma.TransactionClient,
  items: Array<{ productId: string | null; quantity: number }>,
): Promise<void> {
  const restorable = items.filter(
    (item): item is { productId: string; quantity: number } => item.productId !== null,
  );
  if (restorable.length === 0) {
    return;
  }
  await transaction.$executeRaw`
    UPDATE "products" AS product
    SET "stock" = product."stock" + reservation."quantity"
    FROM jsonb_to_recordset(${JSON.stringify(restorable)}::jsonb)
      AS reservation("productId" text, "quantity" integer)
    WHERE product."id" = reservation."productId"
      AND product."source" <> ${demoProductSource}
  `;
}

export async function processStripeEvent(event: Stripe.Event): Promise<'processed' | 'duplicate'> {
  const outcome = getCheckoutOutcome(event);
  if (!outcome) {
    return 'processed';
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    return 'processed';
  }
  if (outcome === 'paid' && !isPaidSessionEvent(event)) {
    await prisma.stripeEvent
      .create({ data: { id: event.id, type: event.type } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return;
        }
        throw error;
      });
    return 'processed';
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.stripeEvent.create({
        data: { id: event.id, type: event.type },
      });
      const order = await transaction.order.findFirst({
        where: {
          id: orderId,
          paymentMethod: 'STRIPE',
          OR: [{ stripeSessionId: session.id }, { stripeSessionId: null }],
        },
        include: { items: true },
      });
      if (!order) {
        return;
      }
      if (order.stripeSessionId === null) {
        await transaction.order.updateMany({
          where: { id: order.id, status: 'PENDING_PAYMENT', stripeSessionId: null },
          data: { stripeSessionId: session.id },
        });
      }
      if (order.status !== 'PENDING_PAYMENT') {
        return;
      }
      if (
        outcome === 'paid' &&
        (session.currency !== 'usd' ||
          session.amount_total !== Math.round(order.total.toNumber() * 100))
      ) {
        throw new Error('Stripe session amount does not match the persisted order total');
      }

      const updated = await transaction.order.updateMany({
        where: {
          id: order.id,
          status: 'PENDING_PAYMENT',
          stripeSessionId: session.id,
        },
        data:
          outcome === 'paid'
            ? { status: 'PAID', paymentStatus: 'PAID', stockReserved: false }
            : {
                status: outcome === 'canceled' ? 'CANCELED' : 'PAYMENT_FAILED',
                paymentStatus: outcome === 'canceled' ? 'CANCELED' : 'FAILED',
                stockReserved: false,
                reservationReleasedAt: new Date(),
              },
      });
      if (updated.count !== 1) {
        return;
      }

      if (outcome === 'paid') {
        const cartLines = order.items.flatMap((item) =>
          item.productId ? [{ productId: item.productId, quantity: item.quantity }] : [],
        );
        if (cartLines.length > 0) {
          await transaction.cartItem.deleteMany({
            where: {
              cart: { userId: order.userId },
              OR: cartLines,
            },
          });
        }
      } else if (order.stockReserved) {
        await restoreReservedStock(transaction, order.items);
      }
    });
    return 'processed';
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return 'duplicate';
    }
    throw error;
  }
}
