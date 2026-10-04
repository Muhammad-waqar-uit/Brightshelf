import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimitStore } from './rateLimitStore';

describe('createRateLimitStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the in-memory store when Redis is not configured in development or production', () => {
    expect(
      createRateLimitStore('auth:test:', {
        NODE_ENV: 'development',
        REDIS_URL: undefined,
      }),
    ).toBeUndefined();
    expect(
      createRateLimitStore('auth:test:', {
        NODE_ENV: 'production',
        REDIS_URL: undefined,
      }),
    ).toBeUndefined();
  });

  it('uses Redis for distributed counts when configured', async () => {
    const sendCommand = vi.fn(async (..._args: string[]) => 'ok');
    const store = createRateLimitStore(
      'auth:test:',
      { NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' },
      sendCommand,
    );

    expect(store).toBeDefined();
    expect(store?.prefix).toBe('auth:test:');
    await store?.sendCommand({ command: ['PING'], isReadOnly: false });
    expect(sendCommand).toHaveBeenCalledWith('PING');
  });
});
