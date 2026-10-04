import Stripe from 'stripe';
import { env } from './env';

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigurationError';
  }
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeConfigurationError('STRIPE_SECRET_KEY is not configured');
  }
  if (!secretKey.startsWith('sk_test_')) {
    throw new StripeConfigurationError('Checkout is restricted to Stripe test keys');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new StripeConfigurationError('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return webhookSecret;
}
