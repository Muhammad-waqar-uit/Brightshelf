import { Router } from 'express';
import Stripe from 'stripe';
import { StripeConfigurationError, getStripeClient, getStripeWebhookSecret } from '../lib/stripe';
import { processStripeEvent } from '../services/stripeWebhooks';

const router = Router();

router.post('/', async (request, response, next) => {
  const signature = request.get('stripe-signature');
  if (!signature || !Buffer.isBuffer(request.body)) {
    response.status(400).json({
      error: { code: 'INVALID_WEBHOOK', message: 'A signed Stripe event is required' },
    });
    return;
  }

  try {
    const event = getStripeClient().webhooks.constructEvent(
      request.body,
      signature,
      getStripeWebhookSecret(),
    );
    const result = await processStripeEvent(event);
    response.json({ received: true, result });
  } catch (error: unknown) {
    if (error instanceof StripeConfigurationError) {
      response.status(503).json({
        error: { code: 'WEBHOOK_UNAVAILABLE', message: 'Stripe webhooks are not configured' },
      });
      return;
    }
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      response.status(400).json({
        error: {
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Stripe signature verification failed',
        },
      });
      return;
    }
    next(error);
  }
});

export default router;
