CREATE TYPE "SessionAuthMethod" AS ENUM ('EMAIL', 'GOOGLE', 'PASSKEY');

ALTER TABLE "Session"
ADD COLUMN "authMethod" "SessionAuthMethod" NOT NULL DEFAULT 'EMAIL';

CREATE TYPE "WebAuthnChallengeType" AS ENUM ('REGISTER', 'AUTHENTICATE');

CREATE TABLE "passkey_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(80) NOT NULL DEFAULT 'This device',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "challengeHash" VARCHAR(64) NOT NULL,
    "type" "WebAuthnChallengeType" NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkey_credentials_credentialId_key"
ON "passkey_credentials"("credentialId");

CREATE INDEX "passkey_credentials_userId_idx"
ON "passkey_credentials"("userId");

CREATE UNIQUE INDEX "webauthn_challenges_challengeHash_key"
ON "webauthn_challenges"("challengeHash");

CREATE INDEX "webauthn_challenges_expiresAt_idx"
ON "webauthn_challenges"("expiresAt");

CREATE INDEX "webauthn_challenges_userId_type_createdAt_idx"
ON "webauthn_challenges"("userId", "type", "createdAt");

CREATE INDEX "webauthn_challenges_type_consumedAt_expiresAt_idx"
ON "webauthn_challenges"("type", "consumedAt", "expiresAt");

ALTER TABLE "passkey_credentials"
ADD CONSTRAINT "passkey_credentials_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webauthn_challenges"
ADD CONSTRAINT "webauthn_challenges_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
