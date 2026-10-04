# Brightshelf: Slice Status and Owner Checklist

Last updated: 2026-10-04

This is the single root-level status file. It summarizes implementation across
the eight roadmap slices, then lists only remaining owner checks and work.
Statuses distinguish code completion from account/device/deployment testing.

## Slice implementation summary

| Slice                    | Status                      | Implemented                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 Storefront and home   | DONE                        | Responsive storefront shell, navigation, homepage, category discovery, loading/error/empty states, synthetic-data disclosure.                                                                                                                                 |
| S2 Search and categories | DONE                        | API-backed search, category/price filters, sorting, pagination, validation, and empty/error states.                                                                                                                                                           |
| S3 Product detail        | DONE                        | API-backed product details, not-found handling, image fallback, and add-to-cart behavior.                                                                                                                                                                     |
| S4 Cart                  | DONE                        | Persistent guest/account carts, server-priced totals, cart merge, quantity controls, remove/clear, ownership, and stock checks.                                                                                                                               |
| S5 Account access        | IMPLEMENTED - OWNER TESTING | Email code/link and Google flows, session cookie, protected APIs, revocation, and sign-out-everywhere are implemented. Database migration is applied; live provider checks remain.                                                                            |
| S6 Checkout and orders   | IMPLEMENTED - OWNER TESTING | Address validation, order snapshots, Stripe Checkout, card-only method filtering, signed/idempotent webhooks, order history/detail, stock reservation and release are implemented. Test-mode checkout verification remains.                                   |
| S7 Passkeys              | IMPLEMENTED - OWNER TESTING | Discoverable passkey sign-in, registration and credential management, recent email/Google re-authentication, shared revocable sessions, config validation, and automated tests. Corrected additive migration is applied to the approved development database. |
| S8 Seller marketplace    | IMPLEMENTED - OWNER TESTING | Seller profile/listing APIs and UI, published listings, stock, seller sales view, self-purchase prevention, and Stripe buyer checkout are implemented. Payment testing remains in the checklist.                                                              |

## Completed code-side work

- Security middleware: Helmet/CSP, compression, and rate limiting support.
  Redis is **not required now**. With no `REDIS_URL`, rate limits use an
  in-memory store per API process. Counts are not shared across multiple
  instances; Redis can be added later if shared limits are needed.
- Synthetic demo products are disclosed and not purchasable by default.
  `ALLOW_SYNTHETIC_CHECKOUT=true` permits them only outside production.
- Authorized inventory import has a validated schema and transactional CLI;
  see [catalogue-import.md](./docs/catalogue-import.md).
- README local setup and user walkthrough are documented in [README.md](./README.md).
- Web OAuth and email-link callbacks use `/auth/...` paths outside Vercel's
  `/api/*` rewrite. Vercel configuration and deployment handoff are documented
  in [deployment-production-verification.md](./docs/superpowers/plans/deployment-production-verification.md).
- The revocable-session migration
  `20261009000000_add_revocable_sessions` was applied to the authorized
  development database using `prisma migrate deploy`, without a reset.
  `prisma migrate status` subsequently reported the schema up to date.
- S7 automated route tests mock SimpleWebAuthn verification. No passkey
  ceremony has been verified with a physical authenticator or external service.
- Current validation: `npm run validate` passed, including API type-check and
  124 API tests, web type-check/lint, and production build. `npm test` passed
  166 tests total (124 API, 42 web). API and web `npx oxlint src/` both passed;
  `npx prisma validate --schema prisma/schema.prisma` passed, and
  `prisma migrate status` reports the database schema is up to date. Read-only
  database inspection confirmed both passkey tables and `Session.authMethod`;
  a live database-to-schema diff is empty. After stopping the active API
  watchers, Prisma Client regenerated successfully and `npm run build
--workspace api` passed. One API server was restarted; `/api/health` returned
  `{"status":"ok"}` and unauthenticated passkey access returned the expected 401.
- The first approved passkey migration attempt failed because the SQL referenced
  lowercase names rather than the existing quoted `"Session"` and `"User"`
  tables. A read-only inspection confirmed no passkey objects persisted. The
  migration SQL was corrected, the failed attempt was marked rolled back, and
  `prisma migrate deploy` then applied it successfully without a reset.

## Owner testing checklist

Complete these checks with development/test accounts and test-mode services.
Do not use live Stripe keys or a real payment card.

1. **Email authentication and sessions**
   - Configure `JWT_SECRET`, `WEB_ORIGIN`, and SMTP (`SMTP_HOST`, `SMTP_PORT`,
     `SMTP_USER`, `SMTP_APP_PASSWORD`, optional `SMTP_FROM`) in `api/.env`.
     Use a Gmail app password, not the account password.
   - At `/register`, request an email sign-in link. Open it once, confirm the
     account is signed in, refresh to verify persistence, then sign out.
   - Open the same link again and confirm it is rejected.
   - Sign in from two browser profiles, choose sign out everywhere in one, and
     confirm the other profile loses access to protected routes.

2. **Google authentication**
   - Configure matching `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values in
     API and web environments. Set
     `GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback` in the
     web environment and register that exact callback with Google.
   - Complete the provider round trip, confirm the account identity, refresh,
     and verify the session persists.

3. **Stripe card checkout**
   - Configure a Stripe test-mode `STRIPE_SECRET_KEY` in `api/.env`.
   - Run the listener and use its printed `whsec_...` as
     `STRIPE_WEBHOOK_SECRET`:

     ```powershell
     stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,checkout.session.async_payment_failed --forward-to localhost:4000/api/webhooks/stripe
     ```

   - Sign in as a buyer who does not own the product. Complete one checkout
     with Stripe's test card `4242 4242 4242 4242`, a future expiry, any CVC,
     and a valid postal code.
   - Verify Stripe CLI delivery of the completed event, the order's PAID state,
     cart behavior, and duplicate-event idempotency. Check Dashboard test-mode
     payment methods agree with card-only checkout.
   - A previous $2 test payment already exists; do not repeat that payment.

4. **Inventory and synthetic catalogue**
   - Import only inventory Brightshelf is authorized to list, using the schema
     and command in [catalogue-import.md](./docs/catalogue-import.md).
   - Verify imported title, price, publication, and stock. Confirm synthetic
     checkout is blocked by default.
   - If testing the opt-in, set `ALLOW_SYNTHETIC_CHECKOUT=true` only in local
     development/test and confirm production still rejects synthetic items.

5. **Mobile storefront**
   - Check the home page on a physical phone and a tablet-sized device.
     Review navigation, search, touch targets, readable text, and horizontal
     scrolling. Browser checks at 375px and 768px showed no horizontal
     overflow.

6. **Vercel deployment**
   - Owner configures Vercel services, domains, environment variables, database,
     OAuth/SMTP, and Stripe test webhook using
     [the deployment handoff](./docs/superpowers/plans/deployment-production-verification.md).
   - Verify deployed health, sign-in callbacks, catalogue, cart, checkout, and
     test-mode webhook. No deployment, production migration, DNS change, or
     live payment has been performed.

7. **Passkeys**
   - The approved development database now has migration
     `20261010000000_add_passkeys` applied. Set `WEBAUTHN_RP_ID=localhost` and
     `WEBAUTHN_ORIGIN=http://localhost:3000` in `api/.env`.
   1. Locally on localhost, register a passkey while signed in with a recent
      email or Google session.
   2. Sign out, sign in with the passkey, and confirm the session persists on
      refresh.
   3. In a second browser profile, sign in and use sign out everywhere, then
      confirm the passkey session is revoked too.
   4. Register two passkeys, rename one, remove one. Confirm removing the last
      passkey requires recent email or Google re-authentication.
   5. Confirm email and Google sign-in still work.
   6. Test on a phone if possible.
   7. After deployment on the final HTTPS hostname, re-register and test on one
      platform authenticator and one roaming authenticator before marking S7
      DONE. Production RP ID and origin must match that hostname. Localhost
      credentials do not transfer to another domain; do not register against
      changing preview deployment URLs.

## Remaining development

- The S7 passkey implementation is complete on the code side. Remaining work
  is the owner testing above; its additive development migration is applied.
  See [the implementation plan](./docs/superpowers/plans/s7-passkeys.md).
- Redis is optional for the current scope. Revisit it if deploying multiple
  API instances and shared rate-limit counters become necessary.
- Do not mark external checks complete until the owner confirms the relevant
  checklist items. No commits or pushes have been made for this work.
