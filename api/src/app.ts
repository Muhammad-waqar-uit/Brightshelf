import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './lib/env';
import authRouter from './routes/auth';
import cartRouter from './routes/cart';
import ordersRouter from './routes/orders';
import productsRouter from './routes/products';

export const app = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

export default app;
