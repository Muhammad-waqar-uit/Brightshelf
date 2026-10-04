# Deployment and Production Verification Plan

## Status

Code handoff complete; owner deployment and production verification remain.
This document is the deployment checklist. Do not create cloud resources, change
DNS, apply production migrations, enable live payments, or deploy from this
coding task.

## Objective

Deploy and verify Brightshelf with separate web and API services, a managed
PostgreSQL database, verified authentication callbacks, and a signed Stripe
webhook. Redis is optional for the initial deployment; without it, API rate
limits are local to each process. Preserve the current web/API boundary and
make rollback possible without destructive database operations.

## Proposed hosting

Recommended starting point, subject to account, quota, and cost confirmation:

- Vercel Services using the existing `vercel.json` routing: Next.js from
  `web/`, Express from `api/`, and a server-side web-to-API binding named
  `API_URL`.
- Supabase PostgreSQL using a pooled runtime URL for application traffic and
  the separately approved migration URL for schema changes.
- Redis-compatible service only if shared rate-limit state is needed. Without
  `REDIS_URL`, the API uses its in-memory limiter; limits are not shared across
  multiple instances.
- Use the owner-approved DNS domain and HTTPS on the web and API origins.

Before choosing Vercel production/Hobby, confirm current function duration,
build/runtime, request-body, connection, and usage limits against expected
traffic. If they do not meet the project's needs or cost boundary, compare a
single container platform for both services before provisioning anything.

## Pre-deployment gates

1. The revocable-session migration has been applied to the approved development
   database and `prisma migrate status` reports it up to date. Run the remaining
   schema checks and owner-side auth tests there. For production, inspect the
   migration history and pending SQL before applying migrations separately.
   Never reset the configured shared or production schema.
2. Decide which products are authorized real inventory. Do not expose synthetic
   products as purchasable. Keep `ALLOW_SYNTHETIC_CHECKOUT=false`; production
   rejects synthetic items regardless.
3. Confirm seller payout/commission and marketplace legal requirements before
   representing seller listings as a production marketplace. Do not infer
   Stripe Connect or payouts from the existing buyer checkout.
4. Confirm deployment regions, expected traffic, budget/free-plan boundaries,
   domain ownership, and an authorized maintenance window.
5. Validate builds and tests from the exact release commit. No deployment
   should run with failing checks or unresolved Prisma client generation.

## Environment and secrets

Create secrets directly in the hosting provider's encrypted environment UI.
Use separate development/preview/production values and least-privilege access.
Never copy a production secret to a local `.env` file or commit it.

API service variables:

- `NODE_ENV=production`, `PORT` if required by the host, and exact `WEB_ORIGIN`.
- `DATABASE_URL` for pooled runtime queries and `DIRECT_URL` for approved
  migration jobs.
- `JWT_SECRET`, freshly generated for production and shared only where the
  current web/API session design requires it.
- `REDIS_URL` (optional) for distributed rate limits. If unset, each API
  process applies its own in-memory limits.
- Google `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if Google sign-in is
  enabled.
- SMTP host, port, dedicated user/app password, sender, and display name for
  email code/link delivery.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only after approval to enable
  the selected Stripe mode. Use test mode until live processing is explicitly
  authorized.
- `ALLOW_SYNTHETIC_CHECKOUT=false`.
- `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` only after passkeys are implemented and
  the final domain is fixed.

Web service variables:

- Use the host's API service binding for `API_URL`; do not hard-code a public
  API address if the Vercel binding is available.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact
  `GOOGLE_REDIRECT_URI` if Google sign-in is enabled.
- Set only the public web origin as browser-visible configuration. No Stripe
  secret, database URL, SMTP credential, signing secret, or webhook secret may
  be exposed to the browser.

Update `.env.example` only for variable names and non-secret defaults. No
credential values belong in the repository.

## Database migration procedure

1. Confirm the production database is backed up and record the latest backup
   timestamp and restore procedure.
2. Run `prisma migrate status` against the intended database using a
   read-only/approved migration connection.
3. Review each pending migration SQL. If history differs or an operation is
   destructive, stop for owner approval and do not reset or edit production
   history.
4. Apply additive migrations in a controlled release job with the direct
   connection. Record migration output and resulting migration status.
5. Deploy code only after schema compatibility is confirmed. Keep migrations
   backward compatible across the rollout; defer column drops or rewrites to a
   later approved cleanup release.
6. Verify API health and read-only catalogue/account checks after deployment.

## Authentication and callback setup

- Web-side OAuth start and callback handlers use `/auth/google` and
  `/auth/google/callback`, and email links use `/auth/email/callback`, outside
  the Vercel `/api/*` rewrite to Express. Local route tests verify Google
  redirect/PKCE and callback behavior. Register
  `https://<web-domain>/auth/google/callback` as the production Google callback
  and complete provider round trips before treating auth as deployment-verified.
- Verify web and API Google client IDs match the approved OAuth project.
- Configure SMTP credentials and verify a production-safe sender/domain.
- Confirm cookie domain, HTTPS, secure, httpOnly, and sameSite behavior across
  the web/API service binding. Browser sessions must remain on the web origin.
- Run OAuth round trip, email code/link, `/api/auth/me`, sign-out, and
  sign-out-everywhere only with owner-approved production test accounts.
- Passkeys remain excluded until S7 is separately approved and the final
  relying-party domain is confirmed.

## Stripe webhook and payment verification

- Keep Stripe in test mode until live payment enablement is explicitly approved.
- Register the exact HTTPS endpoint
  `https://<api-domain>/api/webhooks/stripe` in the correct Stripe mode.
- Subscribe only to handled checkout events:
  `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.expired`, and
  `checkout.session.async_payment_failed`.
- Store the signing secret in the API service's encrypted environment.
- Verify raw-body signature validation, duplicate-event idempotency, paid-order
  state, stock reservation/release, and cancellation behavior with a test-mode
  payment and Stripe's event delivery/replay tools.
- Confirm Stripe Dashboard payment methods agree with the application's
  card-only checkout plan. Do not use a real card or live key during
  verification.

## Health checks and release smoke tests

- Confirm `GET /api/health` returns HTTP 200 through the public API route and
  through the web service path.
- Verify homepage, search, product detail, sign-in, cart, seller listing, and
  checkout load with visible error states when a dependency is unavailable.
- Verify only authorized inventory is purchasable and a seller cannot purchase
  their own listing.
- Verify a test-mode webhook marks one order paid exactly once.
- Inspect provider logs, Redis connection/rate-limit behavior, PostgreSQL pool
  use, CSP/security headers, and browser console for errors.
- Record deployed release identifier, check output, migration status, webhook
  delivery result, and rollback decision. Do not record secret values.

## Rollback

1. Pause further releases and record the failing release identifier and
   observable symptoms.
2. Roll the web and API services back to the last known-good application
   release using the provider's version rollback mechanism.
3. Do not automatically roll back or reset the database. Keep additive
   migrations compatible with the prior application version.
4. If a migration cannot be safely forward-fixed, stop writes to affected
   features and ask the owner to approve a database restore from the verified
   backup. Record expected data loss before restoring.
5. Confirm health, sign-in, catalogue reads, order integrity, and webhook
   delivery after rollback. Re-enable writes/payments only with owner approval.

## Required owner inputs

- Approval of this plan and the hosting provider/service choice.
- Web/API domains, DNS control, deployment project/team access, and preferred
  regions.
- Production PostgreSQL URLs and backup/restore owner, plus approval before
  applying any production migration.
- Redis provider/plan and production URL only if you choose shared limits now.
- Whether production Google sign-in and SMTP email are in scope, plus authorized
  OAuth configuration and sender identity.
- Whether Stripe remains test-only for submission or live payments are intended.
  Live keys, webhook setup, payment policy, refunds, disputes, and legal
  approval are out of scope until expressly authorized.
- Authorized real-inventory source, data/image rights, product owner, and final
  seller marketplace policy.
- Approved deployment window, monitoring/contact owner, and rollback authority.

## Approval boundary

No service creation, secrets entry, DNS changes, migration against production,
deployment, real payment, or account-based verification occurs as part of this
plan. Begin a separate implementation/deployment task only after the owner
reviews this document, supplies the blocking inputs, and explicitly approves
the next action.
