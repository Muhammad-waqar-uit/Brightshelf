import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { quoteGuestCart } from '../services/cart';

const router = Router();

const cartQuoteSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(128),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .max(50)
      .refine(
        (items) => new Set(items.map(({ productId }) => productId)).size === items.length,
        'A product may appear only once in the cart',
      ),
  })
  .strict();

router.post('/quote', async (request, response, next) => {
  const input = cartQuoteSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_CART',
        message: input.error.issues[0]?.message ?? 'Invalid cart input',
      },
    });
    return;
  }

  try {
    response.json(await quoteGuestCart(input.data.items));
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.status(503).json({
        error: {
          code: 'CART_UNAVAILABLE',
          message: 'The cart service is temporarily unavailable',
        },
      });
      return;
    }

    next(error);
  }
});

router.use((_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Cart endpoint not found',
    },
  });
});

export default router;
