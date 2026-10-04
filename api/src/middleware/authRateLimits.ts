import { createRateLimiter } from './rateLimit';

const authRateLimitResponse = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many authentication attempts. Please try again later.',
  },
};

export const challengeRateLimit = createRateLimiter({
  prefix: 'auth:challenge:',
  limit: 5,
  message: authRateLimitResponse,
});

export const verificationRateLimit = createRateLimiter({
  prefix: 'auth:verification:',
  limit: 10,
  message: authRateLimitResponse,
});

export const googleExchangeRateLimit = createRateLimiter({
  prefix: 'auth:google-exchange:',
  limit: 10,
  message: authRateLimitResponse,
});

export const passkeyAuthenticationRateLimit = createRateLimiter({
  prefix: 'auth:passkey-authentication:',
  limit: 10,
  message: authRateLimitResponse,
});

export const passkeyManagementRateLimit = createRateLimiter({
  prefix: 'auth:passkey-management:',
  limit: 10,
  message: authRateLimitResponse,
});
