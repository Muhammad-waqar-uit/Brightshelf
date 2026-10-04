import { createHash } from 'node:crypto';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { Prisma, type WebAuthnChallengeType } from '@prisma/client';
import { Router, type NextFunction, type Response } from 'express';
import { z } from 'zod';
import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  passkeyAuthenticationRateLimit,
  passkeyManagementRateLimit,
} from '../middleware/authRateLimits';
import { createSessionCookie } from '../services/sessions';

const router = Router();
const challengeLifetimeMs = 5 * 60 * 1000;
const credentialLabelSchema = z.string().trim().min(1).max(80);
const renameSchema = z.object({ label: credentialLabelSchema }).strict();

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!isRecord(value) || !isRecord(value.response)) {
    return false;
  }
  const response = value.response;
  return (
    typeof value.id === 'string' &&
    typeof value.rawId === 'string' &&
    value.type === 'public-key' &&
    isRecord(value.clientExtensionResults) &&
    typeof response.clientDataJSON === 'string' &&
    typeof response.attestationObject === 'string' &&
    (response.transports === undefined || isStringArray(response.transports))
  );
}

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!isRecord(value) || !isRecord(value.response)) {
    return false;
  }
  const response = value.response;
  return (
    typeof value.id === 'string' &&
    typeof value.rawId === 'string' &&
    value.type === 'public-key' &&
    isRecord(value.clientExtensionResults) &&
    typeof response.clientDataJSON === 'string' &&
    typeof response.authenticatorData === 'string' &&
    typeof response.signature === 'string' &&
    (response.userHandle === undefined ||
      response.userHandle === null ||
      typeof response.userHandle === 'string')
  );
}

const registrationVerifySchema = z
  .object({
    label: credentialLabelSchema.default('This device'),
    response: z.custom<RegistrationResponseJSON>(isRegistrationResponse),
  })
  .strict();
const authenticationVerifySchema = z
  .object({ response: z.custom<AuthenticationResponseJSON>(isAuthenticationResponse) })
  .strict();
const challengeClientDataSchema = z.object({ challenge: z.string().min(1) });

function webAuthnConfig(): { rpID: string; origin: string } | null {
  if (!env.WEBAUTHN_RP_ID || !env.WEBAUTHN_ORIGIN) {
    return null;
  }
  return { rpID: env.WEBAUTHN_RP_ID, origin: env.WEBAUTHN_ORIGIN };
}

function sendFailure(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

function hashChallenge(challenge: string): string {
  return createHash('sha256').update(challenge).digest('hex');
}

function getClientChallenge(clientDataJSON: string): string | null {
  try {
    const parsed = challengeClientDataSchema.safeParse(
      JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data.challenge : null;
  } catch {
    return null;
  }
}

async function persistChallenge(
  challenge: string,
  type: WebAuthnChallengeType,
  userId?: string,
): Promise<void> {
  await prisma.webAuthnChallenge.create({
    data: {
      challengeHash: hashChallenge(challenge),
      type,
      userId,
      expiresAt: new Date(Date.now() + challengeLifetimeMs),
    },
  });
}

function hasRecentEmailOrGoogleReauthentication(request: AuthRequest): boolean {
  const session = request.authSession;
  return Boolean(
    session &&
    (session.authMethod === 'EMAIL' || session.authMethod === 'GOOGLE') &&
    session.createdAt.getTime() >= Date.now() - challengeLifetimeMs,
  );
}

function requireRecentEmailOrGoogleReauthentication(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  if (hasRecentEmailOrGoogleReauthentication(request)) {
    next();
    return;
  }
  sendFailure(
    response,
    403,
    'REAUTHENTICATION_REQUIRED',
    'Re-authenticate with email or Google to manage passkeys.',
  );
}

router.post(
  '/registration/options',
  requireAuth,
  requireRecentEmailOrGoogleReauthentication,
  passkeyManagementRateLimit,
  async (request: AuthRequest, response, next) => {
    const config = webAuthnConfig();
    if (!config) {
      sendFailure(response, 503, 'PASSKEYS_UNAVAILABLE', 'Passkeys are not configured.');
      return;
    }
    if (!request.user) {
      sendFailure(response, 401, 'UNAUTHENTICATED', 'A signed-in account is required.');
      return;
    }
    const userId = request.user.id;
    const userEmail = request.user.email;

    try {
      const credentials = await prisma.passkeyCredential.findMany({
        where: { userId },
        select: { credentialId: true, transports: true },
      });
      const options = await generateRegistrationOptions({
        rpName: 'Brightshelf',
        rpID: config.rpID,
        userID: new TextEncoder().encode(userId),
        userName: userEmail,
        userDisplayName: userEmail,
        attestationType: 'none',
        excludeCredentials: credentials.map(({ credentialId, transports }) => ({
          id: credentialId,
          transports,
        })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      });
      await persistChallenge(options.challenge, 'REGISTER', userId);
      response.json({ options });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.post(
  '/registration/verify',
  requireAuth,
  requireRecentEmailOrGoogleReauthentication,
  passkeyManagementRateLimit,
  async (request: AuthRequest, response, next) => {
    const parsed = registrationVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      sendFailure(response, 400, 'INVALID_INPUT', 'The passkey registration response is invalid.');
      return;
    }
    const config = webAuthnConfig();
    if (!config) {
      sendFailure(response, 503, 'PASSKEYS_UNAVAILABLE', 'Passkeys are not configured.');
      return;
    }
    if (!request.user) {
      sendFailure(response, 401, 'UNAUTHENTICATED', 'A signed-in account is required.');
      return;
    }
    const userId = request.user.id;

    const challengeValue = getClientChallenge(parsed.data.response.response.clientDataJSON);
    if (!challengeValue) {
      sendFailure(
        response,
        400,
        'INVALID_PASSKEY',
        'The passkey registration could not be verified.',
      );
      return;
    }

    try {
      const challenge = await prisma.webAuthnChallenge.findUnique({
        where: { challengeHash: hashChallenge(challengeValue) },
      });
      if (
        !challenge ||
        challenge.type !== 'REGISTER' ||
        challenge.userId !== userId ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now()
      ) {
        sendFailure(
          response,
          400,
          'INVALID_CHALLENGE',
          'The registration challenge is invalid or expired.',
        );
        return;
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: parsed.data.response,
          expectedChallenge: challengeValue,
          expectedOrigin: config.origin,
          expectedRPID: config.rpID,
          requireUserVerification: true,
        });
      } catch {
        sendFailure(
          response,
          400,
          'INVALID_PASSKEY',
          'The passkey registration could not be verified.',
        );
        return;
      }
      if (!verification.verified) {
        sendFailure(
          response,
          400,
          'INVALID_PASSKEY',
          'The passkey registration could not be verified.',
        );
        return;
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;
      const duplicate = await prisma.passkeyCredential.findUnique({
        where: { credentialId: credential.id },
        select: { id: true },
      });
      if (duplicate) {
        sendFailure(
          response,
          409,
          'PASSKEY_ALREADY_REGISTERED',
          'This passkey is already registered.',
        );
        return;
      }

      const registered = await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.webAuthnChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) {
          return false;
        }

        await transaction.passkeyCredential.create({
          data: {
            userId,
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: BigInt(credential.counter),
            transports: credential.transports ?? [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            label: parsed.data.label,
          },
        });
        return true;
      });
      if (!registered) {
        sendFailure(
          response,
          400,
          'INVALID_CHALLENGE',
          'The registration challenge has already been used.',
        );
        return;
      }

      response.status(201).json({ ok: true });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        sendFailure(
          response,
          409,
          'PASSKEY_ALREADY_REGISTERED',
          'This passkey is already registered.',
        );
        return;
      }
      next(error);
    }
  },
);

router.get(
  '/',
  requireAuth,
  requireRecentEmailOrGoogleReauthentication,
  async (request: AuthRequest, response, next) => {
    if (!request.user) {
      sendFailure(response, 401, 'UNAUTHENTICATED', 'A signed-in account is required.');
      return;
    }

    try {
      const credentials = await prisma.passkeyCredential.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          label: true,
          deviceType: true,
          backedUp: true,
          createdAt: true,
          lastUsedAt: true,
        },
      });
      response.json({ passkeys: credentials });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  requireAuth,
  requireRecentEmailOrGoogleReauthentication,
  async (request: AuthRequest, response, next) => {
    const id = z.string().min(1).max(64).safeParse(request.params.id);
    const parsed = renameSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      sendFailure(response, 400, 'INVALID_INPUT', 'Provide a valid passkey label.');
      return;
    }
    if (!request.user) {
      sendFailure(response, 401, 'UNAUTHENTICATED', 'A signed-in account is required.');
      return;
    }

    try {
      const updated = await prisma.passkeyCredential.updateMany({
        where: { id: id.data, userId: request.user.id },
        data: { label: parsed.data.label },
      });
      if (updated.count !== 1) {
        sendFailure(response, 404, 'PASSKEY_NOT_FOUND', 'That passkey was not found.');
        return;
      }
      response.json({ ok: true });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRecentEmailOrGoogleReauthentication,
  async (request: AuthRequest, response, next) => {
    const id = z.string().min(1).max(64).safeParse(request.params.id);
    if (!id.success) {
      sendFailure(response, 400, 'INVALID_INPUT', 'Provide a valid passkey.');
      return;
    }
    if (!request.user) {
      sendFailure(response, 401, 'UNAUTHENTICATED', 'A signed-in account is required.');
      return;
    }
    const userId = request.user.id;

    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const credential = await transaction.passkeyCredential.findFirst({
            where: { id: id.data, userId },
            select: { id: true },
          });
          if (!credential) {
            return 'not-found';
          }

          await transaction.passkeyCredential.delete({ where: { id: credential.id } });
          return 'deleted';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (result === 'not-found') {
        sendFailure(response, 404, 'PASSKEY_NOT_FOUND', 'That passkey was not found.');
        return;
      }
      response.json({ ok: true });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.post(
  '/authentication/options',
  passkeyAuthenticationRateLimit,
  async (_request, response, next) => {
    const config = webAuthnConfig();
    if (!config) {
      sendFailure(response, 503, 'PASSKEYS_UNAVAILABLE', 'Passkeys are not configured.');
      return;
    }

    try {
      const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        userVerification: 'required',
      });
      await persistChallenge(options.challenge, 'AUTHENTICATE');
      response.json({ options });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.post(
  '/authentication/verify',
  passkeyAuthenticationRateLimit,
  async (request, response, next) => {
    const parsed = authenticationVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      sendFailure(response, 400, 'INVALID_INPUT', 'The passkey sign-in response is invalid.');
      return;
    }
    const config = webAuthnConfig();
    if (!config) {
      sendFailure(response, 503, 'PASSKEYS_UNAVAILABLE', 'Passkeys are not configured.');
      return;
    }

    const challengeValue = getClientChallenge(parsed.data.response.response.clientDataJSON);
    if (!challengeValue) {
      sendFailure(response, 400, 'INVALID_PASSKEY', 'Passkey sign-in could not be verified.');
      return;
    }

    try {
      const challenge = await prisma.webAuthnChallenge.findUnique({
        where: { challengeHash: hashChallenge(challengeValue) },
      });
      if (
        !challenge ||
        challenge.type !== 'AUTHENTICATE' ||
        challenge.userId !== null ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now()
      ) {
        sendFailure(
          response,
          400,
          'INVALID_CHALLENGE',
          'The sign-in challenge is invalid or expired.',
        );
        return;
      }

      const credential = await prisma.passkeyCredential.findUnique({
        where: { credentialId: parsed.data.response.id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!credential) {
        sendFailure(response, 401, 'PASSKEY_NOT_RECOGNIZED', 'No matching passkey was found.');
        return;
      }

      const userHandle = parsed.data.response.response.userHandle;
      if (
        userHandle &&
        !Buffer.from(userHandle, 'base64url').equals(Buffer.from(credential.userId, 'utf8'))
      ) {
        sendFailure(response, 401, 'INVALID_PASSKEY', 'Passkey sign-in could not be verified.');
        return;
      }

      const storedCounter = Number(credential.counter);
      if (!Number.isSafeInteger(storedCounter) || storedCounter < 0) {
        sendFailure(response, 401, 'INVALID_PASSKEY', 'Passkey sign-in could not be verified.');
        return;
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: parsed.data.response,
          expectedChallenge: challengeValue,
          expectedOrigin: config.origin,
          expectedRPID: config.rpID,
          requireUserVerification: true,
          credential: {
            id: credential.credentialId,
            publicKey: new Uint8Array(credential.publicKey),
            counter: storedCounter,
            transports: credential.transports,
          },
        });
      } catch {
        sendFailure(response, 401, 'INVALID_PASSKEY', 'Passkey sign-in could not be verified.');
        return;
      }
      const { newCounter, credentialDeviceType, credentialBackedUp } =
        verification.authenticationInfo;
      if (
        !verification.verified ||
        !Number.isSafeInteger(newCounter) ||
        newCounter < 0 ||
        (storedCounter > 0 && newCounter <= storedCounter)
      ) {
        sendFailure(response, 401, 'INVALID_PASSKEY', 'Passkey sign-in could not be verified.');
        return;
      }

      const now = new Date();
      const accepted = await prisma.$transaction(async (transaction) => {
        const consumed = await transaction.webAuthnChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          return false;
        }
        const updatedCredential = await transaction.passkeyCredential.updateMany({
          where: { id: credential.id, counter: credential.counter },
          data: {
            counter: BigInt(newCounter),
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            lastUsedAt: now,
          },
        });
        return updatedCredential.count === 1;
      });
      if (!accepted) {
        sendFailure(
          response,
          401,
          'INVALID_CHALLENGE',
          'The sign-in challenge has already been used.',
        );
        return;
      }

      await createSessionCookie(response, credential.user, 'PASSKEY');
      response.json({ user: { id: credential.user.id, email: credential.user.email } });
    } catch (error: unknown) {
      next(error);
    }
  },
);

router.use((_request, response) => {
  sendFailure(response, 404, 'NOT_FOUND', 'Passkey endpoint not found.');
});

export default router;
