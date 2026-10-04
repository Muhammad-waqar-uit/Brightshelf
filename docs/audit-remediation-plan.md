# Brightshelf Audit Remediation Plan

Created: 2026-10-03

## Goal

Complete the missing shopping journey in verified vertical slices, starting
from the Phase 1 audit in [updated-progress.md](../updated-progress.md). Keep the
approved project stack: Next.js web app, Express API, Prisma, and the configured
PostgreSQL database. Do not treat passing mocked tests as real-database
acceptance.

## Execution rules

- Preserve the user's requested priority: authentication, products, cart, then
  remaining planned features.
- Keep changes inside the active slice. For each slice, implement API, database,
  UI, and wiring together; run focused tests and applicable lint/type/build
  checks before proceeding.
- Add migrations for schema changes. Do not add product claims, stock values,
  or imagery unless the persisted data supports them.
- Do not expose secrets, use real card details, or report deployment as verified
  without testing the deployed URLs.
- Update `updated-progress.md` after each slice with observed results. A slice is
  `DONE` only after real database/API/UI verification and edge-case checks.
- Keep existing unrelated `.agent-logs/` changes intact.

## Phase 0: Resolve decisions and establish slice baseline

1. **Authentication contract resolved:** use Google sign-in plus a customer
   choice of email one-time code or sign-in link, as selected by the owner and
   specified in the existing [S5 plan](./superpowers/plans/s5-account-access.md).
   Do not add email/password authentication or bcrypt as an alternate flow.
2. Verify the owner-selected candidate, DummyJSON, before import: current terms,
   reuse permission for product fields and images, record count, image URLs,
   useful price/stock coverage, and fit with the Brightshelf catalogue scope.
   Owner selection identifies the candidate; it does not replace that
   verification. If any material rights or suitability question cannot be
   answered, stop and ask before importing or substituting another source.
   Treat its records as demo catalogue data, not as evidence of real retail
   inventory. Do not add unsupported discounts, ratings, reviews, or delivery
   claims.
3. Keep production OAuth/SMTP configuration and deployment checks gated on
   credentials and access supplied by the owner. Local secret values must not be
   printed.
4. Record the source approval and external setup in progress before implementing
   the affected slice. Do not change the approved roadmap without owner approval.

**Exit check:** auth contract is settled and the DummyJSON data/rights check is
documented. If suitability cannot be verified, keep product import blocked
rather than marking it done.

## Phase 1: Authentication

### Backend

- Add the user/session persistence required by the approved auth method and
  migrate the database.
- Implement Google sign-in and the approved email challenge flow, logout,
  current-user, input validation, signed session cookie, and verified-user
  middleware. The email challenge can use a one-time code or sign-in link.
- Set cookie policy appropriate to local and production HTTPS, and apply
  login/challenge rate limits. Return the API's consistent error shape.
- Cover invalid or expired challenges, OAuth errors, expired sessions,
  unauthenticated requests, logout, and session refresh.

### Frontend

- Replace heading-only sign-in/register pages with accessible Google and email
  challenge flows, validation, pending and error feedback, and navigation
  between account flows.
- Add server-verified auth state, protected server-side routes, post-login
  redirect, refresh persistence, and a signed-in header/logout state.
- Do not make client-side auth state the authorization boundary.

### Acceptance

- Exercise successful Google and email sign-in, refresh, `/me`, and logout
  against the live local API and database.
- Verify invalid input, invalid/expired challenges, OAuth failure, absent
  session, and rate limiting.
- Verify protected routes reject unauthenticated requests and the UI shows
  failures rather than silently succeeding.
- API/web tests, type checks, lint, and production build pass.

## Phase 2: Products and catalogue

- Complete the DummyJSON source/rights check from Phase 0. If cleared, add an
  idempotent seed/import path that persists only permitted fields and can safely
  be rerun.
- Use source-backed prices and stock only if the verification confirms they are
  present and suitable. Model stock for server-side availability checks; do
  not show other product claims just because the source happens to expose them.
- Retain the database-backed, bounded list endpoint; verify query, exact
  category, price range, sort, page bounds, stable product lookup, and errors
  using actual persisted records.
- Complete the responsive listing and detail views, including loading, empty,
  error, missing-product, and image-unavailable states.
- Verify all links and product fields against persisted rows; do not fabricate
  reviews, discounts, delivery, or stock claims.

### Acceptance

- Seed records exist in the configured database and the seed operation is
  repeatable without duplicate rows.
- `curl` probes prove positive list/search/category/sort/pagination and detail
  responses against those records.
- Browser walkthrough proves product cards, filters, pagination, and detail
  render the API data and recover from missing/error responses.
- Database-backed API tests and relevant web tests pass, along with type,
  lint, and build checks.

## Phase 3: Cart

- Keep guest cart persistence, but add authenticated cart persistence and
  ownership enforced from the verified session, never from request-body user
  IDs.
- Implement get, add, quantity update, remove, and clear operations with Zod
  validation and consistent errors.
- Re-read product prices and availability on the server for every quote or
  mutation. Define stock behavior from real persisted inventory; never trust a
  client price or invent stock.
- Merge the guest cart only after successful sign-in; report unavailable or
  invalid items rather than silently dropping them.
- Wire responsive cart UI, quantity/removal pending states, totals, empty/error
  states, a header count, and a path to checkout.

### Acceptance

- Verify guest refresh persistence and signed-in persistence across refresh
  against the real API/database.
- Verify another user cannot access or modify the cart, invalid quantities are
  rejected, missing/out-of-stock items are reported, and totals use server
  prices.
- Verify merge behavior and failure handling; API and browser tests, type,
  lint, and build checks pass.

## Phase 4: Checkout and orders

- Implement validated address input and simulated payment only; do not collect
  or persist card numbers.
- Re-read cart lines and current prices in the API, calculate totals there, and
  persist an order and line-item snapshots.
- Clear the user's cart only after successful order creation.
- Implement bounded order history and order detail with session-derived
  ownership checks.
- Replace the checkout and orders heading placeholders with usable loading,
  empty, error, success, and invalid-input states.

### Acceptance

- Verify a successful simulated checkout creates exactly one persistent order
  with API-calculated totals and clears only the correct cart.
- Verify invalid address, empty cart, changed/missing product state, and
  database failure do not create a success response or clear the cart.
- Verify the owner can read their orders and a different account cannot access
  them by changing an identifier.
- Run relevant API/browser tests, type checks, lint, and production build.

## Phase 5: Hardening, optional passkeys, and release verification

- Address hardening gaps found in the audit: security headers, compression,
  malformed-body/client error handling, consistent error envelopes, and
  security regression tests.
- Only start optional [S7 passkeys](./superpowers/plans/s7-passkeys.md) after
  account access and the core purchase journey work, and after the owner confirms
  the session contract and deployed RP ID/origin.
- Expand the README with verified local setup and a real walkthrough; document
  required environment variables without secrets.
- Run `npm run validate`, API tests/lint, and the end-to-end checks. Verify the
  deployed API/web URLs only when deployment credentials/access are available.

### Acceptance

- No fake or placeholder product/account/cart/checkout flows remain in shipped
  scope.
- Required malformed-input, unauthorized, unavailable, and persistence failure
  paths return explicit errors and visible UI feedback.
- Build/type/lint/test results and exact runtime/deployment evidence are
  recorded in `updated-progress.md`.

## Current blockers

- **Catalogue source verification:** DummyJSON was selected by the owner, but
  its current terms, image reuse rights, and data suitability have not yet been
  verified; the database is empty.
- **External verification:** production OAuth/SMTP values and deployment access
  are not configured in the local environment.

Authentication implementation follows the selected S5 contract. Product import
remains blocked until the selected DummyJSON data and image rights/scope have
been checked.
