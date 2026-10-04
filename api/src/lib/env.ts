import 'dotenv/config';
import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const syntheticCheckoutOptIn = z
  .preprocess(
    (value) => (value === '' || value === undefined ? 'false' : value),
    z.enum(['true', 'false']).default('false'),
  )
  .transform((value) => value === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: optionalText,
    DIRECT_URL: optionalText,
    REDIS_URL: optionalUrl,
    ALLOW_SYNTHETIC_CHECKOUT: syntheticCheckoutOptIn,
    JWT_SECRET: optionalText,
    STRIPE_SECRET_KEY: optionalText,
    STRIPE_WEBHOOK_SECRET: optionalText,
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    WEB_ORIGIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().default('http://localhost:3000'),
    ),
    WEBAUTHN_RP_ID: optionalText,
    WEBAUTHN_ORIGIN: optionalUrl,
    SMTP_HOST: z.preprocess(
      (value) => (value === '' || value === undefined ? 'smtp.gmail.com' : value),
      z.string().min(1).default('smtp.gmail.com'),
    ),
    SMTP_PORT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().int().positive().default(465),
    ),
    SMTP_USER: optionalText,
    SMTP_APP_PASSWORD: optionalText,
    SMTP_FROM: optionalText,
    SMTP_FROM_NAME: z.preprocess(
      (value) => (value === '' || value === undefined ? 'Brightshelf' : value),
      z.string().min(1).default('Brightshelf'),
    ),
  })
  .superRefine((config, context) => {
    const { WEBAUTHN_ORIGIN: origin, WEBAUTHN_RP_ID: rpId } = config;
    if (config.NODE_ENV === 'production' && (!rpId || !origin)) {
      context.addIssue({
        code: 'custom',
        message: 'WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN are required in production',
        path: ['WEBAUTHN_RP_ID'],
      });
    }

    if (!rpId || !origin) {
      return;
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'WEBAUTHN_ORIGIN must be a valid origin URL',
        path: ['WEBAUTHN_ORIGIN'],
      });
      return;
    }

    const exactOrigin =
      parsedOrigin.origin === origin.replace(/\/$/, '') &&
      parsedOrigin.pathname === '/' &&
      !parsedOrigin.search &&
      !parsedOrigin.hash;
    const matchingRpId =
      parsedOrigin.hostname === rpId || parsedOrigin.hostname.endsWith(`.${rpId}`);

    if (!exactOrigin || !matchingRpId) {
      context.addIssue({
        code: 'custom',
        message: 'WEBAUTHN_ORIGIN must be an exact origin on WEBAUTHN_RP_ID',
        path: ['WEBAUTHN_ORIGIN'],
      });
    }

    if (config.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        message: 'WEBAUTHN_ORIGIN must use HTTPS in production',
        path: ['WEBAUTHN_ORIGIN'],
      });
    }

    if (config.NODE_ENV === 'production' && rpId === 'localhost') {
      context.addIssue({
        code: 'custom',
        message: 'WEBAUTHN_RP_ID must be the production hostname, not localhost',
        path: ['WEBAUTHN_RP_ID'],
      });
    }
  });

export const env = envSchema.parse(process.env);
