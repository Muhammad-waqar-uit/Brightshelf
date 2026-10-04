import { Prisma } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { getOrder, listOrders } from '../services/orders';

const router = Router();

const listQuerySchema = z
  .object({
    cursor: z.string().min(1).max(32).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const orderIdSchema = z.string().min(1).max(32);

function getAuthenticatedUserId(request: AuthRequest): string {
  if (!request.user) {
    throw new Error('Authenticated order route did not receive a verified user');
  }
  return request.user.id;
}

function handleOrderError(error: unknown, next: NextFunction, response: Response) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    response.status(503).json({
      error: {
        code: 'ORDERS_UNAVAILABLE',
        message: 'The order service is temporarily unavailable',
      },
    });
    return;
  }
  next(error);
}

router.post('/', requireAuth, (_request, response) => {
  response.status(410).json({
    error: {
      code: 'PAYMENT_FLOW_REPLACED',
      message: 'Use the secure Stripe checkout session endpoint to place an order.',
    },
  });
});

router.get('/', requireAuth, async (request, response, next) => {
  const query = listQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: query.error.issues[0]?.message ?? 'Invalid order query',
      },
    });
    return;
  }

  try {
    response.json(await listOrders(getAuthenticatedUserId(request), query.data));
  } catch (error: unknown) {
    handleOrderError(error, next, response);
  }
});

router.get('/:orderId', requireAuth, async (request, response, next) => {
  const orderId = orderIdSchema.safeParse(request.params.orderId);
  if (!orderId.success) {
    response.status(400).json({
      error: { code: 'INVALID_ORDER_ID', message: 'A valid order ID is required' },
    });
    return;
  }

  try {
    const order = await getOrder(getAuthenticatedUserId(request), orderId.data);
    if (!order) {
      response.status(404).json({
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
      });
      return;
    }
    response.json({ order });
  } catch (error: unknown) {
    handleOrderError(error, next, response);
  }
});

router.use((_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Order endpoint not found' },
  });
});

export default router;
