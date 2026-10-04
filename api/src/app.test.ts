import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('GET /api/health', () => {
  it('returns the service status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sets security headers with Stripe-compatible content security policy', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain('https://js.stripe.com');
    expect(response.headers['content-security-policy']).toContain('https://hooks.stripe.com');
  });

  it('varies responses by accepted compression encoding', async () => {
    const response = await request(app).get('/api/health').set('Accept-Encoding', 'gzip');

    expect(response.headers.vary).toContain('Accept-Encoding');
  });
});
