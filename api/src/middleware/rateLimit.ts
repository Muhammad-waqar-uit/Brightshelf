import rateLimit from 'express-rate-limit';
import { createRateLimitStore } from './rateLimitStore';

type RateLimitMessage = {
  error: {
    code: string;
    message: string;
  };
};

type RateLimitConfig = {
  prefix: string;
  limit: number;
  message: RateLimitMessage;
};

export function createRateLimiter({ prefix, limit, message }: RateLimitConfig) {
  const store = createRateLimitStore(prefix);

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message,
    ...(store ? { store } : {}),
  });
}
