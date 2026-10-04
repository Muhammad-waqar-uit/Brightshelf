import request from 'supertest';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './app';

const webhookMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getStripeClient: vi.fn(),
  getStripeWebhookSecret: vi.fn(),
  processStripeEvent: vi.fn(),
}));

vi.mock('./lib/stripe', () => ({
  getStripeClient: webhookMocks.getStripeClient,
  getStripeWebhookSecret: webhookMocks.getStripeWebhookSecret,
  StripeConfigurationError: class StripeConfigurationError extends Error {},
}));
vi.mock('./services/stripeWebhooks', () => ({
  processStripeEvent: webhookMocks.processStripeEvent,
}));

describe('Stripe webhook route', () => {
  beforeEach(() => {
    webhookMocks.constructEvent.mockReset();
    webhookMocks.getStripeWebhookSecret.mockReset().mockReturnValue('whsec_test');
    webhookMocks.getStripeClient.mockReset().mockReturnValue({
      webhooks: { constructEvent: webhookMocks.constructEvent },
    });
    webhookMocks.processStripeEvent.mockReset().mockResolvedValue('processed');
  });

  it('requires a signature and passes the exact raw request body to Stripe', async () => {
    const withoutSignature = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{"id":"evt_test"}'));
    expect(withoutSignature.status).toBe(400);
    expect(webhookMocks.constructEvent).not.toHaveBeenCalled();

    const rawBody = Buffer.from('{"id":"evt_test","type":"checkout.session.completed"}');
    const event = { id: 'evt_test', type: 'checkout.session.completed' } as Stripe.Event;
    webhookMocks.constructEvent.mockReturnValueOnce(event);
    const response = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'signed-value')
      .send(rawBody.toString());

    expect(response.status).toBe(200);
    expect(webhookMocks.constructEvent).toHaveBeenCalledWith(rawBody, 'signed-value', 'whsec_test');
    expect(webhookMocks.processStripeEvent).toHaveBeenCalledWith(event);
  });

  it('rejects invalid webhook signatures without processing the event', async () => {
    webhookMocks.constructEvent.mockImplementationOnce(() => {
      throw new Stripe.errors.StripeSignatureVerificationError('bad-signature', 'raw-event');
    });

    const response = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'invalid')
      .send(Buffer.from('{"id":"evt_invalid"}'));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    expect(webhookMocks.processStripeEvent).not.toHaveBeenCalled();
  });
});
