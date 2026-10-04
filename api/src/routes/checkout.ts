import { Prisma } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { StripeConfigurationError } from '../lib/stripe';
import {
  cancelStripeCheckout,
  CheckoutServiceError,
  createStripeCheckoutSession,
} from '../services/stripeCheckout';

const router = Router();
const checkoutRateLimit = createRateLimiter({
  prefix: 'checkout:',
  limit: 10,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many checkout attempts. Please try again later.' },
  },
});

const checkoutSchema = z
  .object({
    checkoutKey: z.string().uuid(),
    address: z
      .object({
        name: z.string().trim().min(1).max(120),
        line1: z.string().trim().min(1).max(160),
        line2: z.union([z.string().trim().max(160), z.literal('')]).optional(),
        city: z.string().trim().min(1).max(100),
        region: z.string().trim().min(1).max(100),
        postalCode: z.string().trim().min(1).max(24),
        country: z
          .string()
          .trim()
          .length(2)
          .transform((value) => value.toUpperCase()),
      })
      .strict(),
  })
  .strict();

function getUserId(request: AuthRequest): string {
  if (!request.user) {
    throw new Error('Authenticated checkout route did not receive a verified user');
  }
  return request.user.id;
}

function sendCheckoutFailure(
  result: Awaited<ReturnType<typeof createStripeCheckoutSession>>,
  response: Response,
): void {
  if (result.status === 'empty') {
    response.status(409).json({ error: { code: 'EMPTY_CART', message: 'Your cart is empty' } });
  } else if (result.status === 'unavailable') {
    response.status(409).json({
      error: {
        code: 'UNAVAILABLE_PRODUCTS',
        message: 'A cart item is no longer available. Review your cart and try again.',
        productIds: result.productIds,
      },
    });
  } else if (result.status === 'ineligible') {
    response.status(409).json({
      error: {
        code: 'DEMO_ITEMS_NOT_PURCHASABLE',
        message:
          'Synthetic demo checkout is disabled. Remove those items or enable the local/test opt-in.',
        productIds: result.productIds,
      },
    });
  } else if (result.status === 'own-listings') {
    response.status(409).json({
      error: {
        code: 'SELF_PURCHASE_NOT_ALLOWED',
        message:
          'You cannot purchase your own seller listings. Remove them or use a buyer account.',
        productIds: result.productIds,
      },
    });
  } else if (result.status === 'stock') {
    response.status(409).json({
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Available stock changed. Review your cart and try again.',
        productIds: result.productIds,
      },
    });
  } else if (result.status === 'amount-limit') {
    response.status(422).json({
      error: {
        code: 'CHECKOUT_AMOUNT_LIMIT',
        message: 'The order total exceeds the test checkout limit.',
      },
    });
  } else if (result.status === 'key-conflict') {
    response.status(409).json({
      error: { code: 'CHECKOUT_KEY_CONFLICT', message: 'This checkout key cannot be used.' },
    });
  } else if (result.status === 'terminal') {
    response.status(409).json({
      error: {
        code: 'CHECKOUT_CLOSED',
        message: 'This checkout attempt has ended. Start a new checkout to try again.',
        orderId: result.orderId,
      },
    });
  }
}

function handleCheckoutError(error: unknown, next: NextFunction, response: Response): void {
  if (error instanceof StripeConfigurationError) {
    response.status(503).json({
      error: {
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Secure test checkout is not configured yet.',
      },
    });
    return;
  }
  if (error instanceof CheckoutServiceError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    response.status(503).json({
      error: { code: 'CHECKOUT_UNAVAILABLE', message: 'Checkout is temporarily unavailable.' },
    });
    return;
  }
  next(error);
}

router.post('/session', requireAuth, checkoutRateLimit, async (request, response, next) => {
  const input = checkoutSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_CHECKOUT',
        message: input.error.issues[0]?.message ?? 'Invalid checkout details',
      },
    });
    return;
  }
  try {
    const result = await createStripeCheckoutSession(getUserId(request), {
      checkoutKey: input.data.checkoutKey,
      address: { ...input.data.address, line2: input.data.address.line2 ?? '' },
    });
    if (result.status !== 'ready') {
      sendCheckoutFailure(result, response);
      return;
    }
    response.status(200).json({
      orderId: result.orderId,
      checkoutUrl: result.checkoutUrl,
      paymentStatus: result.paymentStatus,
    });
  } catch (error: unknown) {
    handleCheckoutError(error, next, response);
  }
});

router.post('/:orderId/cancel', requireAuth, checkoutRateLimit, async (request, response, next) => {
  const orderId = z.string().min(1).max(32).safeParse(request.params.orderId);
  if (!orderId.success) {
    response.status(400).json({
      error: { code: 'INVALID_ORDER_ID', message: 'A valid order ID is required.' },
    });
    return;
  }
  try {
    const result = await cancelStripeCheckout(getUserId(request), orderId.data);
    if (result.status === 'not-found') {
      response.status(404).json({
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
      });
      return;
    }
    response.json(result);
  } catch (error: unknown) {
    handleCheckoutError(error, next, response);
  }
});

router.use((_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Checkout endpoint not found' },
  });
});

export default router;
