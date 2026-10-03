import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { listProducts } from '../services/products';

const router = Router();
const productListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(8),
});

router.get('/', async (request, response, next) => {
  const query = productListQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: 'limit must be an integer between 1 and 24',
      },
    });
    return;
  }

  try {
    const products = await listProducts(query.data.limit);
    response.json({ products });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.status(503).json({
        error: {
          code: 'CATALOG_UNAVAILABLE',
          message: 'The product catalog is temporarily unavailable',
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
      message: 'Product endpoint not found',
    },
  });
});

export default router;
