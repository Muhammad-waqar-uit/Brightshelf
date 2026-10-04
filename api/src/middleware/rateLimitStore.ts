import { RedisStore, type SendCommandFn } from 'rate-limit-redis';
import { createClient } from 'redis';
import { env } from '../lib/env';

type StoreConfig = Pick<typeof env, 'NODE_ENV' | 'REDIS_URL'>;

let redisClient: ReturnType<typeof createClient> | undefined;
let redisConnection: Promise<unknown> | undefined;

function redisSender(redisUrl: string): SendCommandFn {
  return async (...args) => {
    if (!redisClient) {
      redisClient = createClient({ url: redisUrl });
      redisClient.on('error', () => {
        console.error('Redis rate-limit client error');
      });
    }

    if (!redisClient.isReady) {
      redisConnection ??= redisClient.connect().catch((error: unknown) => {
        redisConnection = undefined;
        throw error;
      });
      await redisConnection;
    }

    return redisClient.sendCommand(args);
  };
}

export function createRateLimitStore(
  prefix: string,
  config: StoreConfig = env,
  sendCommand?: SendCommandFn,
): RedisStore | undefined {
  if (!config.REDIS_URL) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: sendCommand ?? redisSender(config.REDIS_URL),
  });
}
