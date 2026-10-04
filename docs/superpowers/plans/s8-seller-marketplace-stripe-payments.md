# Proposed S8 Plan: Seller Listings and Stripe Buyer Payments

## Status

Approved on 2026-10-04. The owner approved continuing through the remaining
vertical slices before the next review.

Implementation checkpoint (2026-10-04): seller activation, listing publication,
storefront/cart integration, Stripe Checkout Session creation, cancellation,
webhook signature handling, and buyer/seller order views are implemented. A
$2 Stripe test-mode Visa payment succeeded. The actual `checkout.session.completed`
event was retrieved and replayed through the local raw-body webhook with a
locally generated signature; the order became paid, stock was finalized, the
buyer cart was cleared, duplicate replay was idempotent, and buyer/seller views
showed paid. This replay validates the handler with the real event payload, but
does not prove Stripe-originated delivery of the paid event. At payment time,
the CLI listener was authenticated to a different test account. After correcting
it to use the API's configured test account, a real `checkout.session.expired`
event from an unpaid browser checkout reached the API with HTTP 200. A web
checkout action that had hit Prisma P2028 was retested successfully after raising
the transaction timeout from 5,000 ms to 15,000 ms; the unpaid session was
canceled and stock/cart state was preserved.

**Completed 2026-10-04:** the Stripe webhook endpoint is now registered at
`https://brightshelf.vercel.app/api/webhooks/stripe` with
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, and `checkout.session.expired`. The
signing secret is wired to the deployed API, the handler verifies signatures and
rejects unsigned requests, and both the API and web services are deployed to
production. The catalogue was cleared of the 300 synthetic demo items and
replaced with 50 real imported products from DummyJSON, all with stock and no
seller ownership, so they are purchasable. S8.3 and S8.4 are now complete; only
the final paid-order webhook transition remains to be observed.

## Baseline at plan approval (2026-10-04)

- S6 checkout and order history are implemented locally. Orders currently use
  simulated payment, free demo shipping, a server-validated cart snapshot, and
  transactional cart clearing.
- `Product` currently has a title, description, category, price, optional image
  URLs and brand. It has no seller owner, publication state, or stock count.
- The catalogue contains synthetic demonstration records. Those records are
  explicitly not for sale and must not be charged for.
- `User` has no seller profile or seller-specific permissions.
- Stripe credentials and webhook handling are not configured.

## Owner-confirmed direction

- Build a true multi-vendor seller experience. A signed-in user can become a
  seller and manage their own product listings.
- Seller registration is self-serve. The proposed first version does not
  require manual seller approval.
- Add buyer-side Stripe payments. Stripe Connect onboarding, marketplace
  commissions, and seller payouts are not part of this plan.

## Outcome

Deliver a verified test-mode purchase journey:

1. A signed-in user enables seller access.
2. The seller creates, edits, publishes, unpublishes, and archives their own
   products and stock.
3. Buyers discover published seller products, add them to a cart, and continue
   through checkout.
   Sellers cannot purchase their own listings; checkout rejects self-owned
   cart items using the verified buyer identity. Other buyer accounts can buy
   those published listings.
4. The API validates current seller listing, price, stock, and delivery details,
   then creates a pending order and a Stripe-hosted Checkout Session.
5. Stripe's verified webhook, not the browser return URL, records payment
   success and finalizes the order.
6. Buyers see persistent payment/order status. Sellers can see a limited,
   owner-scoped summary of their sold line items.

S8 should not claim real retail availability or production payment readiness
until live data, policy, account, and deployment prerequisites have been
reviewed separately.

## Proposed defaults for review

- Use Stripe-hosted Checkout in USD with the current Stripe SDK's
  `allowed_payment_method_types: ['card']` filter. Do not collect or handle
  card numbers in Brightshelf.
- Keep Stripe Dashboard payment-method settings aligned with the code-level
  card-only restriction, and verify the hosted Checkout page offers no
  non-card methods in test mode.
- Use Stripe test mode only during this phase. Do not enable live charges.
- Stripe payments are collected on the Brightshelf platform Stripe account.
  Seller balances and payouts are not represented as paid or payable by the app.
- Retain the current zero-cost demo shipping behavior only for the test-mode
  walkthrough, and clearly label it. Do not imply a shipping or delivery
  promise. Do not calculate or collect tax in this phase.
- Keep seller listing images out of the first purchase-flow milestone unless
  the owner confirms an existing Supabase Storage bucket and its upload
  configuration. Seller-provided image URLs could be a separately approved
  alternative; do not silently accept arbitrary URL/image upload behavior.
- Keep the existing synthetic catalogue visible only with its current
  fictional/not-for-sale disclosure. Only eligible, published seller listings
  can enter a paid checkout.

These defaults must be confirmed before live payments or any claim of a
production-ready marketplace. In particular, Stripe buyer payments without
Connect do not pay sellers.

## Work

### Seller identity and access

- Add a seller profile related one-to-one to the existing authenticated user.
- Provide an explicit seller activation/onboarding action and collect a public
  seller display name plus the minimum required profile details.
- Keep buyer and seller capabilities on the same account/session. Derive seller
  identity from the verified session and database profile, never from request
  body IDs.
- Make seller routes unavailable until seller activation succeeds. Apply input
  validation, ownership checks, and request rate limits to write operations.
- Clearly state that this self-serve seller profile does not establish seller
  identity, tax status, payout eligibility, or regulatory compliance.

### Seller product listings

- Add seller ownership, listing status, and non-negative inventory to seller
  products. Suggested states: `DRAFT`, `PUBLISHED`, and `ARCHIVED`.
- Do not assign existing synthetic catalogue items to sellers or make them
  purchasable.
- Add seller-scoped create, update, publish/unpublish, archive, and bounded
  listing reads. A seller must not edit or archive another seller's products.
- Validate title, description, category, integer-cent price bounds, stock
  bounds, and any image field at the API boundary. Reject invalid prices and
  unsupported image schemes/domains.
- Public catalogue and product detail reads must not expose drafts or archived
  seller listings. Cart and checkout must independently enforce published
  state and stock; hiding a listing in the UI is not authorization.
- Add seller dashboard states for loading, empty inventory, validation errors,
  save/publish success, and API/network failure.

### Buyer purchase and Stripe payment

- Replace the S6 simulated-payment submission in the paid path with a
  server-created Stripe Checkout Session. Keep the existing order history
  contract useful for both legacy simulated orders and Stripe-paid orders.
- Create a pending order and immutable line-item snapshots from the verified
  account cart and current database product/seller data. Never accept client
  totals, unit prices, seller IDs, or order ownership.
- In one database transaction, verify each cart line is published and in stock,
  calculate totals in integer cents, and reserve stock before starting external
  checkout. Prevent a product from being oversold by concurrent checkouts.
- Use a UUID idempotency key for order/session creation. Store the Stripe
  Checkout Session ID and payment status on the order. Do not create duplicate
  orders or sessions for a repeated request.
- Create the Stripe Session server-side using the persisted order snapshot,
  with success and cancel URLs built from the configured web origin. Do not
  trust browser-provided redirect URLs.
- Verify webhook signatures against the exact raw request body. Register the
  Stripe webhook route before JSON body parsing, following the current Express
  middleware architecture.
- Persist processed Stripe event IDs or otherwise enforce equivalent
  idempotency. Handle at least completed/paid, expired, and failed/canceled
  checkout outcomes. Reject invalid signatures without changing orders.
- Treat the webhook as the source of truth. A redirect to the success page is
  not evidence of payment. The success page should query the API for persisted
  order status and show pending confirmation if the webhook has not arrived.
- On confirmed payment, mark the order paid and clear only cart entries that
  still match the purchased snapshot. Do not clear items added or changed after
  checkout began.
- On expiration/cancellation or failed session creation, release stock
  reservations exactly once, mark the pending order accordingly, and retain
  the buyer's cart. Make a retry possible without duplicating an order.
- Keep idempotent behavior across duplicate, delayed, and out-of-order webhook
  delivery. Do not regress or downgrade an already-paid order on a later event.

### Order and seller views

- Extend order status to distinguish pending payment, paid, canceled/expired,
  and payment failure without rewriting existing simulated S6 records.
- Preserve owner-scoped buyer order list and detail pages. Show clear pending,
  paid, and canceled states, line-item snapshots, total, delivery details, and
  payment method without displaying sensitive Stripe data.
- Add a bounded seller sales/listing summary that returns only that seller's
  own order line items and status. Do not expose another seller's lines or
  buyer delivery address. Full fulfillment, tracking, returns, and seller
  payouts are excluded.
- Preserve useful loading, empty, unknown-order, unauthorized, and service
  failure states on buyer and seller pages.

## Proposed API surface

- `POST /api/seller/profile` or an equivalent idempotent seller activation
  endpoint.
- `GET /api/seller/profile` for the authenticated seller profile.
- `GET /api/seller/products` and `POST /api/seller/products`.
- `PATCH /api/seller/products/:productId` for owner-checked listing changes.
- `POST /api/checkout/session` to validate/reserve the cart and return the
  server-generated Stripe Checkout URL and order reference.
- `POST /api/webhooks/stripe` for signed Stripe events; this endpoint uses raw
  body parsing and does not use browser session authentication.
- Existing public product, cart, and buyer order routes updated consistently
  for listing availability and payment status.

Finalize endpoint names and response/error shapes during the first
implementation slice, then update `docs/design.md` and every web caller in the
same change.

## Proposed vertical slices

Complete and verify one slice before starting the next:

1. **Seller access and listing persistence**
   - Schema/migration, self-serve seller profile, seller-scoped product
     management API, product publication and stock rules, focused tests.
2. **Seller and catalogue UI**
   - Seller dashboard and listing forms; published listings integrated into
     product discovery and detail; accessible validation and failure states.
3. **Stripe test-mode checkout**
   - Stripe server client and documented env placeholders, order/payment schema,
     stock reservation, hosted Checkout Session creation, signed and idempotent
     webhook handling, cancellation and retry behavior.
4. **Buyer/seller order states and end-to-end verification**
   - Payment-pending/success/cancel UI, persisted buyer history/detail, limited
     seller sales view, responsive browser checks, test-mode payment and webhook
     verification, final docs and progress status.

The roadmap is intentionally not changed by this draft. Add an S8 entry and
reorder or defer optional S7 only after the owner approves the proposed scope
and sequence.

## Environment and external prerequisites

- Add only variable names and safe placeholders to the relevant `.env.example`
  files. Expected server-only variables include `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and the existing configured web origin. Do not expose
  secrets through `NEXT_PUBLIC_` variables or commit credentials.
- Confirm the Stripe account and use test keys first. Configure a local webhook
  forwarder or Stripe test webhook endpoint for verification.
- Document checkout success/cancel URLs and the exact webhook route. Configure
  a production webhook and live keys only in a separately approved deployment
  task after test-mode acceptance.
- Confirm Supabase Storage availability before adding seller image uploads.
- Do not reset the database. Use additive Prisma migrations and verify migration
  status before live API checks.

## Acceptance checks

### Seller listings

- A signed-in buyer can self-activate a seller profile; a signed-out user
  cannot.
- Seller A cannot read, edit, publish, unpublish, or archive Seller B's
  listing by guessing/changing an ID.
- Draft and archived listings are absent from public discovery, detail,
  cart, and checkout. Published seller listings show current stored fields.
- Invalid title, category, negative/too-large price, invalid stock, and invalid
  image input are rejected with the standard error format.
- A seller with no listings sees a helpful empty state; save/publish failures
  are visible and retryable.

### Payment and orders

- A valid test-mode buyer checkout creates one pending order from database
  product prices and redirects to a Stripe-hosted session.
- Client-supplied price/total/seller identity tampering cannot affect payment.
- Cart changes, unpublished items, insufficient stock, invalid delivery
  details, empty cart, or Stripe session creation failure do not create a
  paid-looking order or lose cart contents.
- Concurrent purchases cannot oversell stock. Failed/canceled/expired sessions
  release reservations once; paid orders retain their purchased stock
  deduction.
- Valid signed webhook marks the order paid once and clears only unchanged
  purchased cart entries. Duplicate delivery is harmless. Invalid signatures
  cause no state mutation. Browser success redirects without a paid webhook
  continue to show pending status.
- Buyer A cannot view Buyer B's order. Seller A sees only Seller A's sold lines
  and never receives Seller B's information or buyer address.
- Existing S6 simulated orders remain readable and are not misrepresented as
  Stripe-paid orders.
- Browser test mode covers success, cancel, retry, webhook delay, refresh,
  order history/detail, and seller listing to buyer purchase on desktop and
  mobile widths.

## Validation and completion gate

- Write API service/route tests for seller ownership, listing visibility,
  stock reservation/release, price authority, Stripe session failures,
  webhook signatures, duplicate/out-of-order events, and order ownership.
- Use Stripe test mode for the external payment flow. Unit tests with a mocked
  Stripe SDK alone are not enough to call payment integration end-to-end.
- Run `npm run validate`, `npm test`, API and web oxlint, `npx prisma validate`,
  and Prisma migration status.
- Verify the development API and browser against the configured database,
  inspect all temporary test records, and remove only the exact disposable
  records created for the test.
- Keep S8 `PARTIAL` until a test-mode payment and signed webhook complete
  against the database. Do not claim production readiness until live account,
  tax/shipping, seller payout, legal, and deployment decisions are separately
  approved and verified.

## Not in this plan

- Stripe Connect onboarding, commissions, seller balances, or payouts.
- Live-mode card charges or production deployment.
- Tax calculation/remittance, shipping-rate calculation, fulfillment promises,
  labels, tracking, returns, refunds, or disputes.
- Seller identity/KYC review, moderation queue, or admin approval.
- Product image upload unless existing storage is confirmed and the scope is
  explicitly approved.
- Passkeys or unrelated authentication hardening.
