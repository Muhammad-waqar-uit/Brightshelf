# Brightshelf Updated Progress

Updated: 2026-10-04

Historical audit snapshot. This predates the passkey implementation and later
work; use the root [progress.md](./progress.md) for current status and owner
testing.

This snapshot is based on the Phase 1 audit and subsequent local checks.
Statuses describe verified behavior, not code that merely exists or is claimed
complete in earlier docs. `DONE` requires end-to-end verification against the
configured database, UI walkthrough, edge-case handling, and passing checks.

## Current status

| Feature                            | Status  | Verified evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Remaining gap                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation and catalogue           | PARTIAL | Prisma schema validates; the configured development database contains 300 generated synthetic demo products across 10 categories. The seed replaces only records with the Brightshelf demo source tag.                                                                                                                                                                                                                                                                                                                                                                                                                                | No external general-merchandise source met the documented reuse, quantity, and price requirements. Demo prices are illustrative and images are intentionally absent; deployment remains unverified.                                                                                |
| S1 Storefront and home             | PARTIAL | Browser home renders seeded cards, all 10 category links, and a visible fictional-data notice. Profile popover and sign-out interactions were verified earlier. Shared header now displays the guest/account cart count.                                                                                                                                                                                                                                                                                                                                                                                                              | Mobile search was verified, not the home route.                                                                                                                                                                                                                                    |
| S2 Search and categories           | DONE    | Live database/API and browser checks covered text search, exact category, price range, ascending price, all-category navigation, pagination, invalid range (400), zero results, and a 390px search viewport with no horizontal overflow.                                                                                                                                                                                                                                                                                                                                                                                              | Results are synthetic examples, not available retail inventory.                                                                                                                                                                                                                    |
| S3 Product detail                  | DONE    | Browser rendered stored synthetic title, category, description, illustrative price, demo disclosure, and no-image state. Unknown API ID returned 404 and web displayed not-found.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | No real retail images or merchandise claims; demo data only.                                                                                                                                                                                                                       |
| S4 Guest cart                      | DONE    | Browser added a product from its detail page, showed the server-priced line/subtotal, updated quantity and header badge, survived navigation/reload, and cleared to the empty state. Guest storage contains product IDs and quantities only; API rejects invalid quantities and reports unavailable products.                                                                                                                                                                                                                                                                                                                         | Catalogue records and prices are synthetic; checkout is not in this slice.                                                                                                                                                                                                         |
| Signed-in cart and guest merge     | DONE    | Added persistent owner-bound cart CRUD and idempotent guest merge. Live DB/API verification passed add/update/remove/clear, price calculation, invalid quantity, unavailable merge entry, retry deduplication, unauthorized rejection, and isolation between two disposable users. Browser walkthrough signed in with a development email code, observed the guest item in the account cart, confirmed guest storage cleared, and verified account-cart persistence after refresh.                                                                                                                                                    | Checkout was implemented and verified separately under S6.                                                                                                                                                                                                                         |
| S5 Account access                  | PARTIAL | Live database-backed email code and link sign-in, session lookup, logout, and link replay rejection were exercised. SMTP authentication passed a direct check, and the owner confirmed the email-code sign-in flow works after SMTP configuration. OAuth start returns a Google redirect with state, nonce, S256 PKCE, and scoped HTTP-only cookies. Browser sign-in established the session used for guest-cart merge.                                                                                                                                                                                                               | Real email-link delivery is not separately confirmed. A full Google provider round trip remains unverified. Rate limits use an in-process store and JWT sessions have no server-side revocation.                                                                                   |
| S6 Checkout and orders             | PARTIAL | The earlier simulated checkout was verified against the development DB and browser. S8 retired new simulated-order creation (`POST /api/orders` returns 410); existing orders remain readable and eligible new purchases use Stripe test checkout. A real test payment's Stripe event payload was replayed through the local signed webhook, which persisted the paid order and cleared its cart.                                                                                                                                                                                                                                     | S6's simulated purchase path is no longer active. Stripe-originated delivery of the paid event remains unverified; the replay does not prove that delivery path.                                                                                                                   |
| S8 Seller marketplace and Stripe   | PARTIAL | A $2 Stripe test-mode Visa payment succeeded. The actual `checkout.session.completed` event payload was locally signed and replayed through the raw webhook; the order became PAID, stock was finalized, the cart cleared, duplicate replay was idempotent, and buyer order detail plus seller sales showed paid. A real `checkout.session.expired` event from the corrected-account CLI reached the API with HTTP 200. A second browser checkout action created then canceled an unpaid session. The Prisma transaction timeout was raised after a reproduced P2028. `npm run validate` passes with 88 API tests; API oxlint passes. | The original paid event was not delivered to the local listener because it was connected to a different test account at payment time. A Stripe-originated paid event for the order and deployment remain unverified; Dashboard also offers methods beyond the planned card method. |
| S7 Passkeys                        | MISSING | No passkeys implementation present.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Optional slice pending after core flows.                                                                                                                                                                                                                                           |
| Security and engineering hardening | PARTIAL | Auth input is validated; challenges are HMAC-hashed, single-use, and rate-limited; JWT cookie is httpOnly, sameSite=lax, and secure in production. Google state, PKCE, nonce, and ID-token verification are implemented. The development challenge fallback is disabled in production.                                                                                                                                                                                                                                                                                                                                                | Rate-limit storage is process-local; JWT revocation, helmet, and compression are absent. Production mail and Google callback remain unverified.                                                                                                                                    |
| README, deployment, and pre-submit | PARTIAL | Installation and validation scripts exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Deployment verification and user walkthroughs missing.                                                                                                                                                                                                                             |

## Verification record (S5 account access, 2026-10-03)

- Fixed the duplicate Product block in `api/prisma/schema.prisma`; `npx prisma validate` passes.
- Prisma schema validates and the database reports four recorded migrations with no pending drift.
- API email code and link challenges, verification, current-user lookup, logout, and link replay rejection execute against the configured database/API. API tests cover invalid and expired challenges, replay, rate limiting, and Google identity/nonce handling.
- Browser walkthroughs covered code and link sign-in, redirect, header session after refresh, profile popover, and sign-out. The browser is currently signed out.
- Profile popover walkthrough verified its signed-in identity, sign-out action, Escape/focus return, and outside-click dismissal.
- Local OAuth start returned HTTP 307 to Google and included state, nonce, S256 PKCE and expected HTTP-only cookies. This does not verify the complete Google flow.
- `npm run validate` passed with API typecheck, 38 API tests, web typecheck/lint, and production build. `npm test` passed all 54 API/web tests. API oxlint and Prisma validation passed.
- Local `/api/health` returned HTTP 200; unauthenticated `/api/auth/me` returned HTTP 401. The local Google OAuth start endpoint returned HTTP 307.
- The owner tested and confirmed live email-code sign-in works after SMTP setup. Real email-link delivery is not separately confirmed. No secret values are documented.
- Deleted the three exact synthetic S5 test users and their challenge rows after testing.

## Remaining before S5 can be marked DONE

1. Confirm real email-link delivery separately from the email-code flow already tested by the owner.
2. Confirm the registered Google callback URI and verify an actual provider round trip.
3. Reassess process-local rate limiting and stateless JWT revocation before production.

All changes remain uncommitted as requested. Google OAuth code exists and is security-hardened, but the actual Google sign-in remains unverified.

## Product catalogue verification (2026-10-03)

- Owner approved original, clearly labeled synthetic demo data without third-party product images after no suitable licensed external source was found.
- `npm run seed:demo-catalog --workspace api -- --confirm-demo-seed` created 300 synthetic records. A second run replaced only those 300 tagged records.
- Live API verified 300 total products, 10 categories, 13 pages, working page 2, six `desk organizer` matches, price/category sorting and filters, known-ID details, unknown ID 404, and invalid range 400.
- Browser verified populated home, all category links, query/category/price/sort controls, a sorted five-result search, zero-result state, product detail and not-found rendering. Search at 390px had 375px scroll width equal to its layout viewport.
- Demo prices are illustrative and items are not for sale. Product image fields are intentionally empty, and every customer catalogue/product/cart view discloses this.
- `npm run validate` passed with 42 API tests, web typecheck/lint and production build. `npm test` passed all 59 API/web tests (42 API, 17 web). API/web oxlint, Prisma validation, and formatting checks passed.
- API auth tests now explicitly disable SMTP config in their fixture so a developer's real email credentials cannot cause test messages to be sent.
- No commits were made. Wait for owner review before starting the next slice.

## S4 cart verification (2026-10-04)

- Added persistent account carts, authenticated CRUD endpoints, current-database
  price totals, input bounds, and guest-cart merge reporting. Merge retries use
  a browser-persisted UUID idempotency key.
- Applied the additive cart and merge-idempotency migrations without resetting
  the database. Prisma validation and migration status report six migrations
  up to date.
- Live API/database verification used two temporary users and seeded products:
  unauthenticated access returned 401; invalid quantity returned 400; add used
  current DB prices; unavailable guest entries were reported; an identical
  merge retry did not double quantities; one user's cart was not visible to
  another; update, remove, and clear persisted. Both temporary users were
  deleted.
- Browser walkthrough verified guest add from product detail, header badge,
  server-quoted amount, quantity update, persistence after reload, and clear to
  empty state.
- Full account browser walkthrough added a guest item, requested and verified a
  development-only email code, observed the account profile and merged cart,
  confirmed guest storage emptied, refreshed and confirmed account-cart
  persistence, then cleared the cart and signed out. The disposable user and
  four challenges were deleted afterward.
- Focused cart tests passed: 17 API tests and 15 web tests. Final `npm run
validate` passed with API typecheck and all 48 API tests, web typecheck/lint,
  and production build. All 20 web tests passed; API oxlint, Prisma validation,
  and migration status passed.
- Signed-in cart and guest merge meet the S4 acceptance checks and are DONE.
- Local development servers are running at `http://localhost:3000` (web) and
  `http://localhost:4000` (API) for owner review. No commits were made.

## S6 checkout and orders verification (2026-10-06)

- Applied `20261006000000_add_checkout_orders` non-destructively with
  `prisma migrate deploy`; Prisma reports the configured database is up to date.
- Authenticated checkout creates a transactional order snapshot from current
  database prices and clears the account cart only after successful creation.
  A changed cart/title/price returns `409 CART_CHANGED`. Requests use a UUID
  idempotency key, free demo shipping, and simulated payment only; no card data
  is requested or stored.
- Live API/database checks: unauthorized 401; invalid address 400 with cart
  retained; stale price 409 with no order/cart mutation; valid order 201 at the
  server's updated total; identical retry returned the same order; cart emptied
  only on success; other-account detail 404 and history empty; empty-cart and
  cross-owner key reuse 409. Disposable test records were deleted.
- Browser checks: guest cart led to sign-in with `/checkout` continuation;
  authenticated order placement showed confirmation and updated the header
  count to zero; order detail rendered and history remained after refresh;
  unknown order rendered 404. Checkout had no horizontal overflow at 390px or
  1440px.
- `npm run validate` passed with 58 API tests, API/web typechecks, web lint, and
  production build; API oxlint passed. `npm test` passed all 85 tests (58 API,
  27 web). No commits were made.
- S6 is DONE for local development verification. Deployment/payment and the
  separate optional passkey slice are not claimed.

## S8.1 seller profile and listing persistence (2026-10-04)

- Applied the additive seller/listing migration without resetting the
  development database; Prisma reports eight migrations up to date.
- Added self-serve seller activation and authenticated owner-scoped APIs for
  draft listing creation, bounded listing reads, validated updates, publishing,
  unpublishing, and archiving. Publishing requires stock.
- Public catalogue, detail, category, and cart paths hide unavailable seller
  listings and enforce current stock. Seller products are rejected by the
  legacy simulated-order endpoint until Stripe checkout is implemented.
- Live database/API tests verified unauthorized and pre-activation rejection,
  invalid listing input, draft hiding, stock gating, published visibility,
  other-seller isolation, over-stock cart rejection, simulated checkout
  blocking, unpublish/archive behavior, and cleanup of temporary records.
- `npm run validate` passed (69 API tests, API/web typechecks, web lint, and
  production build). API oxlint, Prisma validation, and migration status passed.
- S8 remains PARTIAL. The seller dashboard, Stripe test checkout/webhooks,
  payment states, and seller sales view have not started. No commits were made.

## S8 marketplace and Stripe initial local verification (2026-10-04)

- Added seller dashboard and sales pages, listing create/edit/publish/archive
  actions, seller attribution and stock in catalogue/detail/cart views, and a
  rule that synthetic catalogue records cannot be purchased.
- Added Stripe test-mode Checkout Session creation from authenticated,
  database-priced seller cart lines; pending order snapshots; atomic inventory
  reservation; failure/cancel/expiration release; signed, idempotent webhook
  handling; buyer payment-state views; and seller-scoped sales summaries.
- Applied `20261008000000_add_stripe_checkout_state` additively. Prisma schema
  validation passed and migration status reports all nine migrations up to date.
- `npm run validate` passed: API typecheck and 86 API tests, web typecheck,
  lint, and production build. `npm test` passed all 113 workspace tests
  (86 API, 27 web). Root API/web oxlint, Prisma validation, and the nine-
  migration status check passed.
- Browser walkthrough verified seller activation, a $1 test listing's
  creation/publication, storefront detail, account-cart add, and redirect to
  Stripe-hosted Checkout. No payment was submitted. Cancel return showed the
  canceled state, released stock, retained the cart, and refreshed its badge.
- Stripe CLI signed completion and expiration fixtures reached the webhook
  endpoint with HTTP 200; an invalid signature returned HTTP 400. The fixtures
  did not correspond to the test order, so no paid-order transition is claimed.
- Removed the disposable test account, its listing and four terminal orders,
  and its email challenges after verifying no stock remained reserved.
- Checkout Session creation succeeded after removing Stripe's obsolete
  `payment_method_types` parameter. Stripe Dashboard payment-method selection
  remains owner-configured and currently exposes more methods than the
  card-only plan.
- At this initial checkpoint, local API health and the web route returned HTTP
  200, but no actual payment or paid-order webhook transition had been
  verified. The later payment follow-up below supersedes that status.
  Production configuration and deployment remained unverified.
- All changes remain uncommitted for owner review.

## S8.3-S8.4 card payment and webhook follow-up (2026-10-04)

- A $2 test-mode Visa card payment completed successfully in Stripe Checkout;
  Stripe reported the session paid and its PaymentIntent succeeded. No live
  card or live charge was used.
- At payment time, the local Stripe CLI listener was authenticated to a
  different test account, so the paid event was not delivered to the local API.
  The actual completion event was retrieved from the configured Stripe account
  and replayed through the raw-body webhook using a locally generated signature.
  The API returned HTTP 200 and persisted the order as PAID, finalized the stock
  reservation, cleared the buyer cart, and stored the event. A duplicate replay
  returned `duplicate`. Buyer order detail and seller sales both displayed the
  paid state. This validates the handler with the actual event payload, but is
  not evidence of Stripe-originated delivery of that paid event.
- The Stripe CLI listener was corrected to use the API's configured test
  account. It delivered an actual `checkout.session.expired` event from a
  separate unpaid browser checkout to the local endpoint with HTTP 200.
- The initial web checkout action hit Prisma P2028 after its interactive
  transaction exceeded the 5,000 ms default by 196 ms. The checkout
  transaction timeout is now 15,000 ms. A retest successfully created a hosted
  session through the web action; cancellation expired it, restored stock, and
  retained the buyer cart. No second payment was submitted.
- Removed the disposable verification users, listing, orders, events, carts,
  challenges, and setup script after confirming there were no active
  reservations. Test payment/event history remains in Stripe test mode.
- `npm run validate` passed (API typecheck and 88 API tests, web typecheck,
  lint, and production build); API oxlint passed. S8 remains PARTIAL until a
  Stripe-originated paid-event delivery is verified. Production deployment and
  payment-method configuration remain open. No commits were made.

## Stale-session follow-up (2026-10-04)

- Removing the disposable payment-test user left its session cookie in the
  browser. A cart request then received API 401 and surfaced as Next.js
  `POST /` 500.
- The header auth action now clears the session cookie when `/api/auth/me`
  reports no current user. A regression test covers the recovery behavior.
- After this follow-up, all 28 web tests passed, along with web typecheck and
  lint.
- S8 remains PARTIAL; this fix does not verify Stripe-originated delivery of
  the paid event, Dashboard payment-method configuration, or deployment.

## Progress re-verification (2026-10-04)

- `GET /api/health` returned `{"status":"ok"}`. The catalogue endpoint returned
  3 records from 300 entries, and the signed-out homepage returned HTTP 200 and
  rendered correctly.
- `npm run validate` passed after the stale-session fix, including API
  typecheck and 88 tests, web typecheck and lint, and the production build.
- No additional payment, database mutation, commit, or deployment was made.
