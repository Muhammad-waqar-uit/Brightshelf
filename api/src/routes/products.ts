import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getProduct, listProducts } from '../services/products';

const router = Router();
const productListQuerySchema = z
  .object({
    q: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(100).optional(),
    ),
    category: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).max(80).optional(),
    ),
    minPrice: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().finite().min(0).max(99_999_999.99).optional(),
    ),
    maxPrice: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().finite().min(0).max(99_999_999.99).optional(),
    ),
    sort: z.enum(['newest', 'price-asc', 'price-desc']).default('newest'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict()
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice must not exceed maxPrice' },
  );

router.get('/', async (request, response, next) => {
  const query = productListQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: query.error.issues[0]?.message ?? 'Invalid product query parameters',
      },
    });
    return;
  }

  try {
    const result = await listProducts(query.data);
    response.json(result);
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

router.get('/:id', async (request, response, next) => {
  const id = z.string().min(1).max(128).safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_PRODUCT_ID',
        message: 'Product ID must be between 1 and 128 characters',
      },
    });
    return;
  }

  try {
    const product = await getProduct(id.data);
    if (!product) {
      response.status(404).json({
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        },
      });
      return;
    }
    response.json({ product });
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
