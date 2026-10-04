import { Prisma } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  addAccountCartItem,
  clearAccountCart,
  getAccountCart,
  mergeGuestCart,
  quoteGuestCart,
  removeAccountCartItem,
  replaceAccountCart,
  updateAccountCartItem,
} from '../services/cart';

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

const getItemsSchema = z
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
const cartMergeSchema = getItemsSchema.extend({
  idempotencyKey: z.string().uuid(),
});
const cartItemSchema = z
  .object({
    productId: z.string().min(1).max(128),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();
const quantitySchema = z.object({ quantity: z.number().int().min(1).max(99) }).strict();

function sendMutationResult(
  response: Response,
  result: Awaited<ReturnType<typeof replaceAccountCart>>,
) {
  if (result.status === 'unavailable') {
    response.status(409).json({
      error: {
        code: 'UNAVAILABLE_PRODUCTS',
        message: 'One or more cart products are no longer available',
        productIds: result.productIds,
      },
    });
    return;
  }

  if (result.status === 'limit') {
    response.status(409).json({
      error: {
        code: 'CART_LIMIT_REACHED',
        message: 'The cart item or quantity limit would be exceeded',
      },
    });
    return;
  }

  response.json(result.cart);
}

function getAuthenticatedUserId(request: AuthRequest): string {
  if (!request.user) {
    throw new Error('Authenticated cart route did not receive a verified user');
  }
  return request.user.id;
}

function handleCartError(error: unknown, next: NextFunction, response: Response) {
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

router.get('/', requireAuth, async (request, response, next) => {
  try {
    response.json(await getAccountCart(getAuthenticatedUserId(request)));
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.put('/', requireAuth, async (request, response, next) => {
  const input = getItemsSchema.safeParse(request.body);
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
    const result = await replaceAccountCart(getAuthenticatedUserId(request), input.data.items);
    sendMutationResult(response, result);
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.post('/merge', requireAuth, async (request, response, next) => {
  const input = cartMergeSchema.safeParse(request.body);
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
    response.json(
      await mergeGuestCart(
        getAuthenticatedUserId(request),
        input.data.items,
        input.data.idempotencyKey,
      ),
    );
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.post('/items', requireAuth, async (request, response, next) => {
  const input = cartItemSchema.safeParse(request.body);
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
    const result = await addAccountCartItem(getAuthenticatedUserId(request), input.data);
    sendMutationResult(response, result);
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.patch('/items/:productId', requireAuth, async (request, response, next) => {
  const productId = z.string().min(1).max(128).safeParse(request.params.productId);
  const input = quantitySchema.safeParse(request.body);
  if (!productId.success || !input.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_CART',
        message: 'A valid product ID and quantity between 1 and 99 are required',
      },
    });
    return;
  }

  try {
    const result = await updateAccountCartItem(
      getAuthenticatedUserId(request),
      productId.data,
      input.data.quantity,
    );
    sendMutationResult(response, result);
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.delete('/items/:productId', requireAuth, async (request, response, next) => {
  const productId = z.string().min(1).max(128).safeParse(request.params.productId);
  if (!productId.success) {
    response.status(400).json({
      error: { code: 'INVALID_CART', message: 'A valid product ID is required' },
    });
    return;
  }

  try {
    response.json(await removeAccountCartItem(getAuthenticatedUserId(request), productId.data));
  } catch (error: unknown) {
    handleCartError(error, next, response);
  }
});

router.delete('/', requireAuth, async (request, response, next) => {
  try {
    response.json(await clearAccountCart(getAuthenticatedUserId(request)));
  } catch (error: unknown) {
    handleCartError(error, next, response);
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
