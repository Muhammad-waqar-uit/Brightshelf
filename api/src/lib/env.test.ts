import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

describe('WebAuthn environment configuration', () => {
  it('accepts the local RP ID and HTTP origin', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_ORIGIN: 'http://localhost:3000',
    });

    expect(result.success).toBe(true);
  });

  it('requires matching WebAuthn settings in production', () => {
    const missing = envSchema.safeParse({ NODE_ENV: 'production' });
    const mismatched = envSchema.safeParse({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ID: 'brightshelf.example',
      WEBAUTHN_ORIGIN: 'https://attacker.example',
    });
    const insecure = envSchema.safeParse({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ID: 'brightshelf.example',
      WEBAUTHN_ORIGIN: 'http://brightshelf.example',
    });

    expect(missing.success).toBe(false);
    expect(mismatched.success).toBe(false);
    expect(insecure.success).toBe(false);
  });

  it('accepts an exact HTTPS production origin on the RP ID', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ID: 'brightshelf.example',
      WEBAUTHN_ORIGIN: 'https://shop.brightshelf.example',
    });

    expect(result.success).toBe(true);
  });
});
