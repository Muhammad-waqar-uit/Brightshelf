import type { Response } from 'express';
import type { SessionAuthMethod } from '@prisma/client';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';

export type SessionUser = {
  id: string;
  email: string;
};

export const sessionDurationSeconds = 14 * 24 * 60 * 60;

export async function createSessionCookie(
  response: Response,
  user: SessionUser,
  authMethod: SessionAuthMethod = 'EMAIL',
): Promise<void> {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      authMethod,
      expiresAt: new Date(Date.now() + sessionDurationSeconds * 1000),
    },
  });
  const token = signToken({ sub: user.id, jti: session.id }, { expiresIn: sessionDurationSeconds });
  response.cookie('session', token, {
    httpOnly: true,
    secure: env.WEB_ORIGIN.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: sessionDurationSeconds * 1000,
  });
}
