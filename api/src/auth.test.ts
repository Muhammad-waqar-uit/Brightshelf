import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { app } from './app';
import { signToken } from './lib/jwt';
import { prisma } from './lib/prisma';
import { env } from './lib/env';

const { verifyGoogleIdToken } = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: verifyGoogleIdToken,
  })),
}));

vi.mock('./lib/prisma', () => ({
  prisma: {
    emailChallenge: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('email challenge authentication', () => {
  beforeEach(() => {
    env.SMTP_HOST = '';
    env.SMTP_USER = undefined;
    env.SMTP_APP_PASSWORD = undefined;
    vi.mocked(prisma.emailChallenge.create).mockReset();
    vi.mocked(prisma.emailChallenge.findFirst).mockReset();
    vi.mocked(prisma.emailChallenge.updateMany).mockReset();
    vi.mocked(prisma.user.create).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.session.create)
      .mockReset()
      .mockResolvedValue({
        id: 'session-1',
      } as never);
    vi.mocked(prisma.session.findUnique)
      .mockReset()
      .mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        user: { id: 'user-1', email: 'reader@example.com' },
      } as never);
    vi.mocked(prisma.session.updateMany).mockReset().mockResolvedValue({ count: 1 });
    verifyGoogleIdToken.mockReset();
  });

  it('creates a user, persists the session cookie, returns the current user, and clears the cookie on logout', async () => {
    const email = 'reader@example.com';
    const user = {
      id: 'user-1',
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.user.upsert).mockResolvedValue(user);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user);
    vi.mocked(prisma.emailChallenge.updateMany).mockResolvedValue({ count: 1 });
    const tokenHash = createHmac('sha256', env.JWT_SECRET ?? '')
      .update('654321')
      .digest('hex');
    vi.mocked(prisma.emailChallenge.findFirst).mockResolvedValue({
      id: 'challenge-1',
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
      createdAt: new Date(),
    });

    const challengeResponse = await request(app).post('/api/auth/challenge').send({ email });

    expect(challengeResponse.status).toBe(200);
    expect(challengeResponse.body.ok).toBe(true);
    expect(challengeResponse.body.code).toMatch(/^\d{6}$/);
    expect(prisma.emailChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );

    const verifyResponse = await request(app)
      .post('/api/auth/verify')
      .send({ email, code: '654321' });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.user).toEqual({ id: user.id, email: user.email });
    expect(verifyResponse.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(prisma.emailChallenge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email, tokenHash } }),
    );

    const sessionCookie = verifyResponse.headers['set-cookie'][0].split(';')[0];
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        expiresAt: expect.any(Date),
      }),
    });
    const meResponse = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user).toEqual({ id: user.id, email: user.email });
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      include: { user: true },
    });

    const logoutResponse = await request(app).post('/api/auth/logout').set('Cookie', sessionCookie);
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers['set-cookie'][0]).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null);
    const signedOutResponse = await request(app).get('/api/auth/me');
    expect(signedOutResponse.status).toBe(401);
  });

  it('rejects a revoked or expired session on protected requests', async () => {
    const revokedSession = {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: { id: 'user-1', email: 'reader@example.com' },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(revokedSession as never);
    const token = `session=${signToken({ sub: 'user-1', jti: 'session-1' })}`;

    const revokedResponse = await request(app).get('/api/auth/me').set('Cookie', token);
    expect(revokedResponse.status).toBe(401);

    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      ...revokedSession,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    } as never);
    const expiredResponse = await request(app).get('/api/auth/me').set('Cookie', token);
    expect(expiredResponse.status).toBe(401);
  });

  it('revokes all active sessions and expires the current cookie', async () => {
    const token = `session=${signToken({ sub: 'user-1', jti: 'session-1' })}`;

    const response = await request(app).post('/api/auth/logout-all').set('Cookie', token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, revokedSessions: 1 });
    expect(response.headers['set-cookie'][0]).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null);
    const staleCookieResponse = await request(app).get('/api/auth/me').set('Cookie', token);
    expect(staleCookieResponse.status).toBe(401);
  });

  it('rejects an invalid one-time code', async () => {
    vi.mocked(prisma.emailChallenge.findFirst).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'reader@example.com', code: '123456' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CHALLENGE');
  });

  it('verifies a Google identity and creates the same session cookie', async () => {
    const nonce = 'nonce-value-that-is-long-enough-for-validation';
    const user = {
      id: 'google-user-1',
      email: 'google@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    verifyGoogleIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'Google@Example.com', email_verified: true, nonce }),
    });
    vi.mocked(prisma.user.upsert).mockResolvedValue(user);

    const response = await request(app)
      .post('/api/auth/google/exchange')
      .send({ idToken: 'google-id-token-that-is-long-enough-for-validation', nonce });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: user.id, email: user.email });
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: 'google@example.com' },
      create: { email: 'google@example.com' },
      update: {},
    });
  });

  it('rejects unverified Google email addresses', async () => {
    const nonce = 'nonce-value-that-is-long-enough-for-validation';
    verifyGoogleIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'unverified@example.com', email_verified: false, nonce }),
    });

    const response = await request(app)
      .post('/api/auth/google/exchange')
      .send({ idToken: 'google-id-token-that-is-long-enough-for-validation', nonce });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_GOOGLE_IDENTITY');
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('rejects a Google credential issued for a different OAuth request', async () => {
    verifyGoogleIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'google@example.com',
        email_verified: true,
        nonce: 'a-different-request-nonce-that-is-long-enough',
      }),
    });

    const response = await request(app).post('/api/auth/google/exchange').send({
      idToken: 'google-id-token-that-is-long-enough-for-validation',
      nonce: 'nonce-value-that-is-long-enough-for-validation',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_GOOGLE_IDENTITY');
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('creates one-time email links and stores only their hash', async () => {
    const email = 'reader@example.com';
    vi.mocked(prisma.emailChallenge.create).mockResolvedValue({
      id: 'challenge-link',
      email,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
      createdAt: new Date(),
    });

    const response = await request(app).post('/api/auth/challenge').send({ email, method: 'link' });

    expect(response.status).toBe(200);
    expect(response.body.link).toContain('/auth/email/callback?token=');
    expect(response.body.link).not.toContain('tokenHash');
    expect(prisma.emailChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it('consumes a valid sign-in link once and issues the session cookie', async () => {
    const token = 'a'.repeat(43);
    const email = 'link-reader@example.com';
    const tokenHash = createHmac('sha256', env.JWT_SECRET ?? '')
      .update(token)
      .digest('hex');
    vi.mocked(prisma.emailChallenge.findFirst).mockResolvedValue({
      id: 'challenge-link',
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
      createdAt: new Date(),
    });
    vi.mocked(prisma.emailChallenge.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'link-user',
      email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request(app).post('/api/auth/verify-link').send({ token });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: 'link-user', email });
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(prisma.emailChallenge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash } }),
    );
    expect(prisma.emailChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'challenge-link', used: false }),
      }),
    );
  });

  it('rejects an expired challenge without consuming it', async () => {
    vi.mocked(prisma.emailChallenge.findFirst).mockResolvedValue({
      id: 'expired-challenge',
      email: 'reader@example.com',
      tokenHash: createHmac('sha256', env.JWT_SECRET ?? '')
        .update('123456')
        .digest('hex'),
      expiresAt: new Date(Date.now() - 60_000),
      used: false,
      createdAt: new Date(),
    });

    const response = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'reader@example.com', code: '123456' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CHALLENGE');
    expect(prisma.emailChallenge.updateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON input for Google credentials', async () => {
    const response = await request(app)
      .post('/api/auth/google/exchange')
      .send({ idToken: '', nonce: 'nonce-value-that-is-long-enough-for-validation' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('rate limits repeated email challenge requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).post('/api/auth/challenge').send({ email: 'rate-limit@example.com' }),
      ),
    );

    expect(responses.some((response) => response.status === 429)).toBe(true);
    const limited = responses.find((response) => response.status === 429);
    expect(limited?.body.error.code).toBe('RATE_LIMITED');
  });
});
