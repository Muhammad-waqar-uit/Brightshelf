import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { env } from './lib/env';
import authRouter from './routes/auth';
import cartRouter from './routes/cart';
import checkoutRouter from './routes/checkout';
import ordersRouter from './routes/orders';
import productsRouter from './routes/products';
import passkeysRouter from './routes/passkeys';
import sellersRouter from './routes/sellers';
import stripeWebhooksRouter from './routes/stripeWebhooks';

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://js.stripe.com'],
        frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
        connectSrc: [
          "'self'",
          'https://api.stripe.com',
          'https://r.stripe.com',
          'https://m.stripe.network',
        ],
        imgSrc: ["'self'", 'data:', 'https://*.stripe.com', 'https://*.stripe.network'],
      },
    },
  }),
);
app.use(compression());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhooksRouter);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/auth/passkeys', passkeysRouter);
app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/seller', sellersRouter);

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  // Log the error for local debugging; keep response generic for clients.
  // This is safe for local development but do not expose stack traces in prod.
  // eslint-disable-next-line no-console
  console.error(error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

export default app;
