import { type Request, type Response, type NextFunction } from 'express';
import type { SessionAuthMethod } from '@prisma/client';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
  authSession?: {
    id: string;
    authMethod: SessionAuthMethod;
    createdAt: Date;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.session;
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'No session' } });
      return;
    }

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
      return;
    }
    if (!payload.sub || typeof payload.jti !== 'string') {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } });
      return;
    }

    req.user = { id: session.user.id, email: session.user.email };
    req.authSession = {
      id: session.id,
      authMethod: session.authMethod,
      createdAt: session.createdAt,
    };
    next();
  } catch (error: unknown) {
    next(error);
  }
}
