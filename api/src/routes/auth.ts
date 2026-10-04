import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import nodemailer from 'nodemailer';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { verifyToken } from '../lib/jwt';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { createSessionCookie } from '../services/sessions';
import {
  challengeRateLimit,
  googleExchangeRateLimit,
  verificationRateLimit,
} from '../middleware/authRateLimits';

const router = Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const challengeSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  method: z.enum(['code', 'link']).default('code'),
  returnTo: z.string().max(200).optional(),
});
const verifySchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
});
const linkSchema = z.object({ token: z.string().min(32).max(128) });
const googleExchangeSchema = z.object({
  idToken: z.string().min(32).max(8192),
  nonce: z.string().min(32).max(128),
});

function hashChallenge(value: string): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured in the environment');
  }
  return createHmac('sha256', env.JWT_SECRET).update(value).digest('hex');
}

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  try {
    const parsed = new URL(value, env.WEB_ORIGIN);
    return parsed.origin === new URL(env.WEB_ORIGIN).origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/';
  } catch {
    return '/';
  }
}

function matchesNonce(expected: string, received: string | undefined): boolean {
  if (!received) {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function getTransporter() {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_APP_PASSWORD) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD },
    });
  }
  return null;
}

async function consumeChallenge(tokenHash: string, email?: string) {
  const challenge = await prisma.emailChallenge.findFirst({
    where: { tokenHash, ...(email ? { email } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const now = new Date();

  if (!challenge || challenge.used || challenge.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const consumed = await prisma.emailChallenge.updateMany({
    where: { id: challenge.id, used: false, expiresAt: { gt: now } },
    data: { used: true },
  });
  if (consumed.count !== 1) {
    return null;
  }

  return prisma.user.upsert({
    where: { email: challenge.email },
    create: { email: challenge.email },
    update: {},
  });
}

router.post('/challenge', challengeRateLimit, async (request, response, next) => {
  const parsed = challengeSchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message } });
    return;
  }

  try {
    const { email, method } = parsed.data;
    const transporter = getTransporter();
    if (!transporter && process.env.NODE_ENV === 'production') {
      response.status(503).json({
        error: {
          code: 'EMAIL_DELIVERY_UNAVAILABLE',
          message: 'Email sign-in is temporarily unavailable',
        },
      });
      return;
    }

    const code = method === 'code' ? randomInt(100000, 1000000).toString() : undefined;
    const linkToken = method === 'link' ? randomBytes(32).toString('base64url') : undefined;
    const rawChallenge = code ?? linkToken;
    if (!rawChallenge) {
      next(new Error('Could not create an email challenge'));
      return;
    }

    await prisma.emailChallenge.create({
      data: {
        email,
        tokenHash: hashChallenge(rawChallenge),
        expiresAt: new Date(Date.now() + (method === 'code' ? 5 : 15) * 60 * 1000),
      },
    });

    const signInLink = linkToken
      ? (() => {
          const url = new URL('/auth/email/callback', env.WEB_ORIGIN);
          url.searchParams.set('token', linkToken);
          url.searchParams.set('next', safeReturnPath(parsed.data.returnTo));
          return url.toString();
        })()
      : undefined;

    if (transporter) {
      await transporter.sendMail({
        from: env.SMTP_FROM ?? `${env.SMTP_FROM_NAME} <${env.SMTP_USER}>`,
        to: email,
        subject:
          method === 'code' ? 'Your Brightshelf sign-in code' : 'Your Brightshelf sign-in link',
        text:
          method === 'code'
            ? `Your Brightshelf sign-in code is: ${code}`
            : `Use this one-time link to sign in to Brightshelf: ${signInLink}`,
      });
      response.json({ ok: true });
      return;
    }

    response.json({
      ok: true,
      ...(code ? { code } : {}),
      ...(signInLink ? { link: signInLink } : {}),
    });
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/verify', verificationRateLimit, async (request, response, next) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message } });
    return;
  }

  try {
    const { email, code } = parsed.data;
    const user = await consumeChallenge(hashChallenge(code), email);
    if (!user) {
      response.status(400).json({
        error: {
          code: 'INVALID_CHALLENGE',
          message: 'The provided challenge is invalid, used, or expired',
        },
      });
      return;
    }

    await createSessionCookie(response, user);
    response.json({ user: { id: user.id, email: user.email } });
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/verify-link', verificationRateLimit, async (request, response, next) => {
  const parsed = linkSchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({
        error: { code: 'INVALID_INPUT', message: 'The sign-in link is invalid or expired' },
      });
    return;
  }

  try {
    const user = await consumeChallenge(hashChallenge(parsed.data.token));
    if (!user) {
      response.status(400).json({
        error: {
          code: 'INVALID_CHALLENGE',
          message: 'The sign-in link is invalid, used, or expired',
        },
      });
      return;
    }

    await createSessionCookie(response, user);
    response.json({ user: { id: user.id, email: user.email } });
  } catch (error: unknown) {
    next(error);
  }
});

router.post('/google/exchange', googleExchangeRateLimit, async (request, response, next) => {
  const parsed = googleExchangeSchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'INVALID_INPUT', message: 'A valid Google credential is required' } });
    return;
  }

  if (!env.GOOGLE_CLIENT_ID) {
    response.status(503).json({
      error: { code: 'GOOGLE_SIGN_IN_UNAVAILABLE', message: 'Google sign-in is not configured' },
    });
    return;
  }

  let identity: TokenPayload | undefined;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    identity = ticket.getPayload();
  } catch {
    response.status(401).json({
      error: {
        code: 'INVALID_GOOGLE_IDENTITY',
        message: 'Google sign-in could not verify your account',
      },
    });
    return;
  }

  if (
    !identity?.email ||
    identity.email_verified !== true ||
    !matchesNonce(parsed.data.nonce, identity.nonce)
  ) {
    response.status(401).json({
      error: {
        code: 'INVALID_GOOGLE_IDENTITY',
        message: 'Google did not verify this email address',
      },
    });
    return;
  }

  try {
    const email = identity.email.trim().toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    await createSessionCookie(response, user, 'GOOGLE');
    response.json({ user: { id: user.id, email: user.email } });
  } catch (error: unknown) {
    next(error);
  }
});

router.get('/me', requireAuth, (request: AuthRequest, response) => {
  if (!request.user) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
    return;
  }
  response.json({ user: request.user });
});

function clearSessionCookie(response: Response) {
  response.clearCookie('session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.WEB_ORIGIN.startsWith('https'),
    path: '/',
  });
}

router.post('/logout', async (request, response, next) => {
  const token = request.cookies?.session;
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.sub && typeof payload.jti === 'string') {
        await prisma.session.updateMany({
          where: { id: payload.jti, userId: payload.sub, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch (error: unknown) {
      const expectedJwtError =
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name);
      if (!expectedJwtError) {
        next(error);
        return;
      }
    }
  }

  clearSessionCookie(response);
  response.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (request: AuthRequest, response, next) => {
  if (!request.user) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
    return;
  }

  try {
    const result = await prisma.session.updateMany({
      where: { userId: request.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearSessionCookie(response);
    response.json({ ok: true, revokedSessions: result.count });
  } catch (error: unknown) {
    next(error);
  }
});

router.use((_request, response) => {
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Auth endpoint not found' } });
});

export default router;
