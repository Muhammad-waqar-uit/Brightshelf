import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticationOptions: vi.fn(),
  registrationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
  verifyRegistration: vi.fn(),
  prisma: {
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback(undefined),
    ),
    emailChallenge: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    passkeyCredential: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    session: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    user: { create: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    webAuthnChallenge: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}));

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: mocks.authenticationOptions,
  generateRegistrationOptions: mocks.registrationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthentication,
  verifyRegistrationResponse: mocks.verifyRegistration,
}));

vi.mock('./lib/prisma', () => ({
  prisma: mocks.prisma,
}));

import { app } from './app';
import { env } from './lib/env';
import { signToken } from './lib/jwt';

const user = { id: 'passkey-user', email: 'reader@example.com' };
const authCookie = `session=${signToken({ sub: user.id, jti: 'session-1' })}`;
const challengeValue = 'passkey-challenge';
const challengeHash = createHash('sha256').update(challengeValue).digest('hex');
const registrationResponse = {
  id: 'registration-credential',
  rawId: 'registration-credential',
  type: 'public-key',
  response: {
    clientDataJSON: Buffer.from(JSON.stringify({ challenge: challengeValue })).toString(
      'base64url',
    ),
    attestationObject: 'attestation',
  },
  clientExtensionResults: {},
};
const authenticationResponse = {
  id: 'credential-1',
  rawId: 'credential-1',
  type: 'public-key',
  response: {
    clientDataJSON: Buffer.from(JSON.stringify({ challenge: challengeValue })).toString(
      'base64url',
    ),
    authenticatorData: 'authenticator',
    signature: 'signature',
    userHandle: Buffer.from(user.id).toString('base64url'),
  },
  clientExtensionResults: {},
};
const challengeRecord = {
  id: 'challenge-1',
  challengeHash,
  type: 'AUTHENTICATE',
  userId: null,
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
};
const credentialRecord = {
  id: 'credential-record-1',
  userId: user.id,
  credentialId: 'credential-1',
  publicKey: Buffer.from('public-key'),
  counter: 1n,
  transports: ['internal'],
  deviceType: 'singleDevice',
  backedUp: false,
  user,
};

function authenticatedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    authMethod: 'EMAIL',
    createdAt: new Date(),
    user,
    ...overrides,
  };
}

function resetDatabaseMocks() {
  for (const model of Object.values(mocks.prisma)) {
    if (typeof model === 'object' && model !== null) {
      for (const method of Object.values(model)) {
        if (typeof method === 'function') {
          vi.mocked(method).mockReset();
        }
      }
    }
  }
  mocks.prisma.$transaction
    .mockReset()
    .mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.session.findUnique.mockResolvedValue(authenticatedSession() as never);
  mocks.prisma.session.create.mockResolvedValue({ id: 'new-passkey-session' } as never);
  mocks.prisma.webAuthnChallenge.create.mockResolvedValue({ id: 'challenge-1' } as never);
  mocks.prisma.webAuthnChallenge.updateMany.mockResolvedValue({ count: 1 } as never);
  mocks.prisma.passkeyCredential.findMany.mockResolvedValue([] as never);
  mocks.prisma.passkeyCredential.findUnique.mockResolvedValue(credentialRecord as never);
  mocks.prisma.passkeyCredential.updateMany.mockResolvedValue({ count: 1 } as never);
  mocks.prisma.passkeyCredential.create.mockResolvedValue({ id: 'new-credential' } as never);
  mocks.prisma.passkeyCredential.findFirst.mockResolvedValue({ id: credentialRecord.id } as never);
  mocks.prisma.passkeyCredential.count.mockResolvedValue(2 as never);
  mocks.prisma.passkeyCredential.delete.mockResolvedValue({ id: credentialRecord.id } as never);
  mocks.authenticationOptions.mockResolvedValue({
    challenge: challengeValue,
    rpId: 'localhost',
    userVerification: 'required',
  });
  mocks.registrationOptions.mockResolvedValue({
    challenge: challengeValue,
    rp: { id: 'localhost' },
    user: { id: 'passkey-user' },
    pubKeyCredParams: [],
  });
  mocks.verifyRegistration.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'registration-credential',
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  });
  mocks.verifyAuthentication.mockResolvedValue({
    verified: true,
    authenticationInfo: {
      newCounter: 2,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
    },
  });
  env.WEBAUTHN_RP_ID = 'localhost';
  env.WEBAUTHN_ORIGIN = 'http://localhost:3000';
}

beforeEach(() => {
  resetDatabaseMocks();
});

describe('passkey registration', () => {
  it('requires an authenticated session and excludes credentials owned by that user', async () => {
    const unauthorized = await request(app)
      .post('/api/auth/passkeys/registration/options')
      .send({});
    expect(unauthorized.status).toBe(401);

    mocks.prisma.passkeyCredential.findMany.mockResolvedValue([
      { credentialId: 'existing-id', transports: ['internal'] },
    ] as never);
    const response = await request(app)
      .post('/api/auth/passkeys/registration/options')
      .set('Cookie', authCookie)
      .send({});

    expect(response.status).toBe(200);
    expect(mocks.registrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: user.email,
        excludeCredentials: [{ id: 'existing-id', transports: ['internal'] }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }),
    );
    expect(mocks.prisma.webAuthnChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REGISTER', userId: user.id }),
      }),
    );
  });

  it('validates registration input and atomically stores a verified owned credential', async () => {
    const malformed = await request(app)
      .post('/api/auth/passkeys/registration/verify')
      .set('Cookie', authCookie)
      .send({ response: {} });
    expect(malformed.status).toBe(400);

    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue({
      ...challengeRecord,
      type: 'REGISTER',
      userId: user.id,
    } as never);
    mocks.prisma.passkeyCredential.findUnique.mockResolvedValueOnce(null);
    const response = await request(app)
      .post('/api/auth/passkeys/registration/verify')
      .set('Cookie', authCookie)
      .send({ response: registrationResponse });

    expect(response.status).toBe(201);
    expect(mocks.verifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
      }),
    );
    expect(mocks.prisma.passkeyCredential.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        credentialId: 'registration-credential',
        label: 'This device',
      }),
    });
    expect(mocks.prisma.webAuthnChallenge.updateMany).toHaveBeenCalled();
  });

  it.each([
    ['expired challenge', { expiresAt: new Date(Date.now() - 1) }],
    ['challenge owned by another user', { userId: 'another-user' }],
    ['replayed challenge', { consumedAt: new Date() }],
  ])('rejects a registration with a %s', async (_description, override) => {
    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue({
      ...challengeRecord,
      type: 'REGISTER',
      userId: user.id,
      ...override,
    } as never);
    const response = await request(app)
      .post('/api/auth/passkeys/registration/verify')
      .set('Cookie', authCookie)
      .send({ response: registrationResponse });
    expect(response.status).toBe(400);
    expect(mocks.prisma.passkeyCredential.create).not.toHaveBeenCalled();
  });
});

describe('passkey authentication', () => {
  it('generates discoverable options without requiring an email address', async () => {
    const response = await request(app).post('/api/auth/passkeys/authentication/options').send({});

    expect(response.status).toBe(200);
    expect(mocks.authenticationOptions).toHaveBeenCalledWith({
      rpID: 'localhost',
      userVerification: 'required',
    });
    expect(mocks.prisma.webAuthnChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'AUTHENTICATE', userId: undefined }),
      }),
    );
  });

  it('verifies an assertion, updates its counter, and creates the normal revocable session', async () => {
    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue(challengeRecord as never);
    const response = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .send({ response: authenticationResponse });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(user);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(mocks.verifyAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: challengeValue,
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
      }),
    );
    expect(mocks.prisma.passkeyCredential.updateMany).toHaveBeenCalledWith({
      where: { id: credentialRecord.id, counter: credentialRecord.counter },
      data: expect.objectContaining({ counter: 2n, lastUsedAt: expect.any(Date) }),
    });
    expect(mocks.prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: user.id, authMethod: 'PASSKEY' }),
    });
    const sessionCookie = response.headers['set-cookie'][0].split(';')[0];
    mocks.prisma.session.findUnique.mockResolvedValueOnce(
      authenticatedSession({ revokedAt: new Date(), authMethod: 'PASSKEY' }) as never,
    );
    const revoked = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
    expect(revoked.status).toBe(401);
  });

  it.each([
    ['expired challenge', { expiresAt: new Date(Date.now() - 1) }],
    ['replayed challenge', { consumedAt: new Date() }],
    ['user-bound challenge', { userId: 'another-user' }],
  ])('rejects an assertion with a %s', async (_description, override) => {
    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue({
      ...challengeRecord,
      ...override,
    } as never);
    const response = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .send({ response: authenticationResponse });
    expect(response.status).toBe(400);
    expect(mocks.prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects missing credentials, a mismatched user handle, and invalid signatures without sessions', async () => {
    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue(challengeRecord as never);
    mocks.prisma.passkeyCredential.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .send({ response: authenticationResponse });
    expect(missing.status).toBe(401);

    mocks.prisma.passkeyCredential.findUnique.mockResolvedValueOnce({
      ...credentialRecord,
      user: { ...user, id: 'different-user' },
      userId: 'different-user',
    } as never);
    const wrongUser = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .send({ response: authenticationResponse });
    expect(wrongUser.status).toBe(401);

    mocks.prisma.passkeyCredential.findUnique.mockResolvedValueOnce(credentialRecord as never);
    mocks.verifyAuthentication.mockRejectedValueOnce(new Error('bad signature'));
    const invalidSignature = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .send({ response: authenticationResponse });
    expect(invalidSignature.status).toBe(401);
    expect(mocks.prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects wrong origins, wrong RP IDs, and counter regressions', async () => {
    mocks.prisma.webAuthnChallenge.findUnique.mockResolvedValue(challengeRecord as never);
    app.set('trust proxy', true);
    mocks.verifyAuthentication.mockRejectedValueOnce(new Error('origin mismatch'));
    const wrongOrigin = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .set('X-Forwarded-For', '203.0.113.11')
      .send({ response: authenticationResponse });
    expect(wrongOrigin.status).toBe(401);

    mocks.verifyAuthentication.mockRejectedValueOnce(new Error('RP ID hash mismatch'));
    const wrongRpId = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .set('X-Forwarded-For', '203.0.113.12')
      .send({ response: authenticationResponse });
    expect(wrongRpId.status).toBe(401);

    mocks.verifyAuthentication.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: {
        newCounter: 1,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    });
    const regression = await request(app)
      .post('/api/auth/passkeys/authentication/verify')
      .set('X-Forwarded-For', '203.0.113.13')
      .send({ response: authenticationResponse });
    expect(regression.status).toBe(401);
    expect(mocks.prisma.session.create).not.toHaveBeenCalled();
  });
});

describe('passkey credential management', () => {
  it('scopes listing and rename operations to the authenticated owner', async () => {
    const listed = await request(app).get('/api/auth/passkeys').set('Cookie', authCookie);
    expect(listed.status).toBe(200);
    expect(mocks.prisma.passkeyCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id } }),
    );

    const renamed = await request(app)
      .patch('/api/auth/passkeys/credential-1')
      .set('Cookie', authCookie)
      .send({ label: 'Laptop' });
    expect(renamed.status).toBe(200);
    expect(mocks.prisma.passkeyCredential.updateMany).toHaveBeenCalledWith({
      where: { id: 'credential-1', userId: user.id },
      data: { label: 'Laptop' },
    });
  });

  it('requires recent email or Google authentication to remove the last passkey', async () => {
    mocks.prisma.passkeyCredential.count.mockResolvedValue(1 as never);
    mocks.prisma.session.findUnique.mockResolvedValue(
      authenticatedSession({ authMethod: 'PASSKEY' }) as never,
    );
    const rejected = await request(app)
      .delete('/api/auth/passkeys/credential-1')
      .set('Cookie', authCookie);
    expect(rejected.status).toBe(403);
    expect(mocks.prisma.passkeyCredential.delete).not.toHaveBeenCalled();

    mocks.prisma.session.findUnique.mockResolvedValue(
      authenticatedSession({ authMethod: 'GOOGLE' }) as never,
    );
    const accepted = await request(app)
      .delete('/api/auth/passkeys/credential-1')
      .set('Cookie', authCookie);
    expect(accepted.status).toBe(200);
    expect(mocks.prisma.passkeyCredential.delete).toHaveBeenCalledWith({
      where: { id: credentialRecord.id },
    });
  });

  it('requires recent email or Google authentication before listing credentials', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue(
      authenticatedSession({ authMethod: 'PASSKEY' }) as never,
    );
    const response = await request(app).get('/api/auth/passkeys').set('Cookie', authCookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
    expect(mocks.prisma.passkeyCredential.findMany).not.toHaveBeenCalled();
  });
});

describe('passkey rate limiting', () => {
  it('limits repeated discoverable authentication option requests', async () => {
    app.set('trust proxy', true);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/passkeys/authentication/options')
        .set('X-Forwarded-For', '192.0.2.44')
        .send({});
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });
});
