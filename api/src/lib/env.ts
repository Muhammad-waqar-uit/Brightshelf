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

export const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: optionalText,
    DIRECT_URL: optionalText,
    JWT_SECRET: optionalText,
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    WEB_ORIGIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().default('http://localhost:3000'),
    ),
    WEBAUTHN_RP_ID: optionalText,
    WEBAUTHN_ORIGIN: optionalUrl,
    SMTP_HOST: optionalText,
    SMTP_PORT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
    SMTP_USER: optionalText,
    SMTP_APP_PASSWORD: optionalText,
    SMTP_FROM: optionalText,
  })
  .parse(process.env);
