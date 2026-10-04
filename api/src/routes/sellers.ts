import { Prisma } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  activateSeller,
  createSellerListing,
  getSellerProfile,
  listSellerListings,
  setSellerListingStatus,
  updateSellerListing,
} from '../services/sellers';
import { listSellerSales } from '../services/orders';

const router = Router();
const sellerMutationRateLimit = createRateLimiter({
  prefix: 'seller:mutation:',
  limit: 30,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many seller changes. Please try again later.',
    },
  },
});

const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:')
  .nullable()
  .optional();

const listingSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(80),
    priceCents: z.number().int().min(1).max(99_999_999),
    stock: z.number().int().min(0).max(1_000_000),
    thumbnailUrl: httpsUrl,
    images: z.array(httpsUrl).max(8).default([]),
  })
  .strict();
const listingUpdateSchema = listingSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one listing field is required');
const listingQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const productIdSchema = z.string().min(1).max(128);

function getUserId(request: AuthRequest): string {
  if (!request.user) {
    throw new Error('Authenticated seller route did not receive a verified user');
  }
  return request.user.id;
}

function sendSellerRequired(response: Response) {
  response.status(403).json({
    error: {
      code: 'SELLER_PROFILE_REQUIRED',
      message: 'Activate a seller profile before managing listings',
    },
  });
}

function handleSellerError(error: unknown, next: NextFunction, response: Response) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    response.status(503).json({
      error: {
        code: 'SELLER_SERVICE_UNAVAILABLE',
        message: 'The seller service is temporarily unavailable',
      },
    });
    return;
  }
  next(error);
}

router.post('/profile', requireAuth, sellerMutationRateLimit, async (request, response, next) => {
  const input = profileSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_SELLER_PROFILE',
        message: input.error.issues[0]?.message ?? 'Invalid seller profile',
      },
    });
    return;
  }
  try {
    const profile = await activateSeller(getUserId(request), input.data.displayName);
    response.status(200).json({ profile });
  } catch (error: unknown) {
    handleSellerError(error, next, response);
  }
});

router.get('/profile', requireAuth, async (request, response, next) => {
  try {
    const profile = await getSellerProfile(getUserId(request));
    if (!profile) {
      response.status(404).json({
        error: {
          code: 'SELLER_PROFILE_NOT_FOUND',
          message: 'Activate a seller profile to manage seller listings',
        },
      });
      return;
    }
    response.json({ profile });
  } catch (error: unknown) {
    handleSellerError(error, next, response);
  }
});

router.get('/products', requireAuth, async (request, response, next) => {
  const query = listingQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: query.error.issues[0]?.message ?? 'Invalid seller listing query',
      },
    });

    return;
  }
  try {
    const profile = await getSellerProfile(getUserId(request));
    if (!profile) {
      sendSellerRequired(response);
      return;
    }
    response.json(await listSellerListings(profile.id, query.data.page, query.data.limit));
  } catch (error: unknown) {
    handleSellerError(error, next, response);
  }
});

router.get('/sales', requireAuth, async (request, response, next) => {
  const query = listingQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: query.error.issues[0]?.message ?? 'Invalid seller sales query',
      },
    });
    return;
  }
  try {
    const profile = await getSellerProfile(getUserId(request));
    if (!profile) {
      sendSellerRequired(response);
      return;
    }
    response.json(await listSellerSales(profile.id, query.data.page, query.data.limit));
  } catch (error: unknown) {
    handleSellerError(error, next, response);
  }
});

router.post('/products', requireAuth, sellerMutationRateLimit, async (request, response, next) => {
  const input = listingSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({
      error: {
        code: 'INVALID_LISTING',
        message: input.error.issues[0]?.message ?? 'Invalid product listing',
      },
    });
    return;
  }
  try {
    const profile = await getSellerProfile(getUserId(request));
    if (!profile) {
      sendSellerRequired(response);
      return;
    }
    response.status(201).json({
      product: await createSellerListing(profile.id, input.data),
    });
  } catch (error: unknown) {
    handleSellerError(error, next, response);
  }
});

router.patch(
  '/products/:productId',
  requireAuth,
  sellerMutationRateLimit,
  async (request, response, next) => {
    const productId = productIdSchema.safeParse(request.params.productId);
    const input = listingUpdateSchema.safeParse(request.body);
    if (!productId.success || !input.success) {
      response.status(400).json({
        error: {
          code: 'INVALID_LISTING',
          message: input.success
            ? 'A valid product ID is required'
            : (input.error.issues[0]?.message ?? 'Invalid product listing'),
        },
      });
      return;
    }
    try {
      const profile = await getSellerProfile(getUserId(request));
      if (!profile) {
        sendSellerRequired(response);
        return;
      }
      const product = await updateSellerListing(profile.id, productId.data, input.data);
      if (!product) {
        response.status(404).json({
          error: { code: 'LISTING_NOT_FOUND', message: 'Seller listing not found' },
        });
        return;
      }
      response.json({ product });
    } catch (error: unknown) {
      handleSellerError(error, next, response);
    }
  },
);

for (const action of ['publish', 'unpublish', 'archive'] as const) {
  router.post(
    `/products/:productId/${action}`,
    requireAuth,
    sellerMutationRateLimit,
    async (request, response, next) => {
      const productId = productIdSchema.safeParse(request.params.productId);
      if (!productId.success) {
        response.status(400).json({
          error: { code: 'INVALID_PRODUCT_ID', message: 'A valid product ID is required' },
        });
        return;
      }
      try {
        const profile = await getSellerProfile(getUserId(request));
        if (!profile) {
          sendSellerRequired(response);
          return;
        }
        const result = await setSellerListingStatus(profile.id, productId.data, action);
        if (result.status === 'not-found') {
          response.status(404).json({
            error: { code: 'LISTING_NOT_FOUND', message: 'Seller listing not found' },
          });
          return;
        }
        if (result.status === 'archived') {
          response.status(409).json({
            error: { code: 'LISTING_ARCHIVED', message: 'Archived listings cannot be changed' },
          });
          return;
        }
        if (result.status === 'no-stock') {
          response.status(409).json({
            error: {
              code: 'LISTING_OUT_OF_STOCK',
              message: 'Add available stock before publishing',
            },
          });
          return;
        }
        response.json({ product: result.product });
      } catch (error: unknown) {
        handleSellerError(error, next, response);
      }
    },
  );
}

router.use((_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Seller endpoint not found' },
  });
});

export default router;
