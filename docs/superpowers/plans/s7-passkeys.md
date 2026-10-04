# S7 Plan: Passkeys

## Status

Approved and implemented; owner testing remains. Passkeys are optional and do
not block or replace email and Google sign-in.

## Implementation notes

- Uses `@simplewebauthn/server` 14.x and `@simplewebauthn/browser` 14.x with
  the existing PostgreSQL/Prisma database.
- Migration `20261010000000_add_passkeys` is additive and sorts after
  `20261009000000_add_revocable_sessions`. The first approved deploy attempt
  failed because this schema uses quoted `"Session"` and `"User"` table names;
  the migration was corrected. A read-only inspection found no passkey objects
  persisted, so the failed attempt was marked rolled back and the corrected
  migration was successfully applied with `prisma migrate deploy`.
- Stores SHA-256 hashes of challenges, consumes them atomically on successful
  verification, and applies a five-minute expiry.
- Adds `PASSKEY` as a session authentication method. Passkey sign-in calls the
  same session-cookie helper as email and Google, so it receives the normal
  session record, JWT `jti`, cookie, logout, and revocation behavior.
- Management endpoints require a recent email or Google session. This includes
  registration, listing, rename, and removal; it also ensures deleting the
  last credential cannot be authorized by a passkey-only session.
- Environment validation requires matching RP ID and origin in production,
  requires HTTPS there, and rejects `localhost` as a production RP ID.
- Automated API tests mock WebAuthn verification. Browser/device ceremonies,
  external identity providers, and production-hostname behavior still need
  owner verification.

## Outcome

Allow an authenticated Brightshelf user to register one or more platform or
roaming passkeys, then use any registered passkey to establish the same
revocable Brightshelf session used by email and Google sign-in.

## Proposed approach

- Use `@simplewebauthn/server` for API-side ceremony generation and
  verification, and `@simplewebauthn/browser` for browser ceremonies.
- Keep all credential checks in the API. The browser sends only WebAuthn
  credential responses; it never supplies trusted user identity, public-key
  validity, origin, or RP ID.
- Use discoverable credentials for passkey sign-in so a user can start from a
  "Sign in with a passkey" button without first entering an email address.
- Read `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` from validated API environment
  configuration. Set the RP ID to the final web hostname and the origin to its
  exact HTTPS origin in production. Add matching empty example values only;
  never commit deployed host-specific secrets.

## Data model and migration

Add an additive migration after the migration-history blocker is resolved. It
was resolved before implementation. Do not reset a shared database.

- `PasskeyCredential`: `id`, `userId`, unique `credentialId`, `publicKey`
  bytes, signature `counter`, `transports`, `deviceType`, `backedUp`,
  `createdAt`, and `lastUsedAt`. Add a user index and cascade deletion from the
  owning account.
- `WebAuthnChallenge`: unique challenge value or hash, ceremony `type`,
  nullable `userId` for discoverable sign-in, `expiresAt`, nullable
  `consumedAt`, and `createdAt`. Add indexes for challenge lookup, expiry
  cleanup, and user lookup.
- Store no raw challenge after it has been consumed. Expire outstanding
  challenges after five minutes and consume them atomically so a replay cannot
  establish or register a credential twice.

Credential IDs and public keys are not bearer tokens, but still treat the
credential table as sensitive authentication data. Never log assertion
responses, challenge values, or credential material.

## Registration flow

1. Require a verified current session and re-authentication through the
   existing email or Google flow before offering credential management.
2. API creates registration options using the configured RP and the current
   user's ID and email, excludes that user's existing credentials, persists a
   short-lived registration challenge, and returns public options.
3. Browser calls the platform authenticator and posts the response.
4. API atomically claims the matching unexpired challenge; verifies challenge,
   origin, RP ID, user verification, and registration response; then stores
   credential ID, public key, counter, transports, device type, and backup
   state for the session user.
5. Return a clear success result and refresh the account's credential list.
   Permit multiple credentials and give each a useful user-controlled label.

## Sign-in flow

1. Browser requests authentication options; API creates and stores a
   single-use discoverable-authentication challenge and returns options.
2. Browser invokes the authenticator and posts the assertion.
3. API finds the stored credential by credential ID, verifies the assertion
   against its public key and stored counter, and checks challenge, exact
   origin, RP ID, user verification, and credential ownership.
4. Atomically consume the challenge and update the counter / last-used time.
   A credential counter regression or invalid signature must fail closed.
5. Issue the existing session cookie through the same session-creation helper
   used by email and Google. Do not create a weaker or separate passkey session.

Apply login rate limits and consistent API error responses. Require HTTPS in
production and keep the cookie httpOnly, secure, and sameSite as it is for
other methods.

## Fallback and recovery

- Keep email code/link and Google as visible alternatives on the sign-in page.
- On unsupported browser/device, cancellation, no matching credential, or
  verification failure, show an accessible inline message and a retry/fallback
  path. Never claim sign-in succeeded after a failed ceremony.
- Provide an authenticated account page to list and revoke passkeys. Require
  recent email or Google re-authentication before deleting the last passkey.
- Account recovery remains the existing verified email or Google process.
  Recovery must not allow an unauthenticated request to add a credential.
- Ensure users without a passkey can continue signing in unchanged.

## Tests and acceptance

- Unit-test option generation, credential persistence, stored user ownership,
  counter update, challenge expiry, single-use consumption, and session reuse.
- Test invalid signature, wrong origin, wrong RP ID, wrong user, missing
  credential, replayed/expired challenge, counter regression, malformed input,
  unauthenticated registration, and rate limiting.
- Verify no account/session is created for any rejected assertion.
- Add web tests for unsupported browser, cancellation, pending state, success,
  visible errors, fallback navigation, and credential removal confirmation.
- Run API and web tests, type checks, lint, and production build.
- Manually test registration and sign-in on at least one platform authenticator
  and one roaming authenticator on the deployed HTTPS origin before marking
  the feature done.

## Risks and owner decisions

- The final domain must be chosen before production registration; changing RP
  ID later can make existing credentials unusable.
- Cross-device passkey synchronization behavior varies by browser and provider.
- WebAuthn origin, secure-context, browser, and device checks cannot be fully
  validated by unit tests alone.
- Confirm the preferred credential management location and display name
  behavior before UI implementation. Default proposal: account security page,
  labels such as "This device", with editable labels.
- The session migration blocker was resolved before implementation. The
  passkey migration was applied to the approved development database; migrate
  status reports the schema up to date, and a live-schema diff reports no
  changes.

## Not in scope

Replacing email or Google, password authentication, backup codes, SMS
authentication, production deployment, or weakening origin/RP verification to
make local ceremonies pass.
