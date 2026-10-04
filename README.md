# Brightshelf

Brightshelf is an independently designed general merchandise storefront for a
technical assessment. It uses a Next.js web application, an Express API, and
PostgreSQL through Prisma.

> The included 300-product catalogue is synthetic demonstration data. Its
> products, descriptions, and prices are fictional and are not for sale. Only
> seller-created listings or explicitly imported, authorized inventory can be
> purchased.

Authentication, checkout, real-inventory imports, and passkey credentials
require a configured database. Check migration status before applying migrations;
if it reports drift, stop and resolve the history rather than resetting a shared
or production database.

## Requirements

- Node.js and npm
- A PostgreSQL database
- Stripe CLI and a Stripe test-mode account for local payment testing
- Redis is optional. Without it, rate limits use an in-memory store local to
  each API process; add Redis later if rate limits need to be shared across
  multiple instances.

## Local setup

From the repository root, install dependencies and make private environment
files from the checked-in examples:

```powershell
npm install
Copy-Item api\.env.example api\.env
Copy-Item web\.env.example web\.env.local
```

Set the following values in `api/.env`:

| Variable                   | Purpose                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | PostgreSQL connection string for application queries. Use the provider's pooled runtime URL when applicable.                                         |
| `DIRECT_URL`               | PostgreSQL connection string for Prisma migrations.                                                                                                  |
| `JWT_SECRET`               | Random server-side secret used for email challenges and signed sessions.                                                                             |
| `WEB_ORIGIN`               | The web origin, normally `http://localhost:3000`.                                                                                                    |
| `ALLOW_SYNTHETIC_CHECKOUT` | Keep `false` by default. Set to `true` only for intentional local/test purchases of fictional demo items. Production always rejects synthetic items. |
| `REDIS_URL`                | Optional. Without Redis, rate limits are process-local and are not shared across API instances.                                                      |
| `WEBAUTHN_RP_ID`           | `localhost` for local passkey testing; in production, the final web hostname.                                                                        |
| `WEBAUTHN_ORIGIN`          | `http://localhost:3000` locally; the exact HTTPS origin for the production hostname.                                                                 |

Generate a local signing secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `API_URL=http://localhost:4000` in `web/.env.local`. Google sign-in also
needs the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the web and API
environments. Set `GOOGLE_REDIRECT_URI` in `web/.env.local` and register
`http://localhost:3000/auth/google/callback` as the Google OAuth redirect URI
for local testing.

To receive email codes or links, configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_APP_PASSWORD`, and optionally `SMTP_FROM` in `api/.env`.
Without SMTP, development mode displays a development-only code or link in the
sign-in form. Production does not expose that fallback.

For test-mode Stripe checkout, set `STRIPE_SECRET_KEY` in `api/.env`. The
webhook signing secret is supplied by Stripe CLI in the checkout section below.
Never place live Stripe keys in local development or commit any secret files.

## Database setup

Use a dedicated development database. Check its migration state before applying
migrations:

```powershell
Set-Location api
npx prisma migrate status
npx prisma migrate deploy
Set-Location ..
```

If Prisma reports migration-history drift or proposes resetting a schema, stop.
Do not reset a shared or production database; resolve the history mismatch or
use a clean development database first.

The demo seed is optional and contains only disclosed fictional products:

```powershell
npm run seed:demo-catalog --workspace api
```

For real inventory, import only products and images Brightshelf is authorized
to list. Follow the schema and safeguards in
[the inventory import guide](docs/catalogue-import.md).

## Run locally

Start both the API and web app from the repository root:

```powershell
npm run dev
```

- Web: <http://localhost:3000>
- API health: <http://localhost:4000/api/health>

Check API health from PowerShell:

```powershell
curl.exe http://localhost:4000/api/health
```

The expected response is `{"status":"ok"}`. The root `vercel.json` configures
the two-service Vercel routing, but this guide does not perform or verify a
deployment.

## Sign in

1. Open <http://localhost:3000/register> to start a new account, or
   <http://localhost:3000/sign-in> for an existing account.
2. Choose an email one-time code or sign-in link. In local development without
   SMTP, use the development-only code/link shown by the form; with SMTP
   configured, use the delivered email.
3. Optionally choose Google sign-in after configuring the OAuth variables and
   callback URI above.
4. Refresh the page to confirm the session persists. Use the account menu to
   sign out, or select sign out everywhere to revoke all active sessions.

Authentication depends on the revocable-session database migration. If the
API reports an internal error before that migration is safely applied, do not
treat the sign-in flow as verified.

## Passkeys

Passkeys require the additive `20261010000000_add_passkeys` migration to be
applied to the development database. Do not apply it to a shared database
without the database owner's approval. Configure `WEBAUTHN_RP_ID=localhost`
and `WEBAUTHN_ORIGIN=http://localhost:3000` in `api/.env`, then:

1. Sign in with a recent email or Google session and open
   <http://localhost:3000/account/security>.
2. Add and name a passkey. Credential management requires recent email or
   Google authentication; a passkey session alone cannot add, rename, or
   remove credentials.
3. Sign out and use "Sign in with a passkey". Refresh after sign-in to confirm
   the same revocable session persists.
4. Test renaming and removal. Removing the last credential requires recent
   email or Google authentication.

Passkeys registered for `localhost` do not work on another domain. In
production, `WEBAUTHN_RP_ID` must be the final hostname and `WEBAUTHN_ORIGIN`
must be its exact HTTPS origin. Do not register production credentials against
changing Vercel preview URLs. Re-register on the final production hostname.

## Browse and list products

- Use Discover, search, category filters, or the featured products on Home.
- Synthetic demo catalogue products are clearly disclosed and cannot be checked
  out by default.
- To exercise a purchase, create a seller listing with available stock or
  import authorized real inventory. A seller cannot buy their own listing;
  sign in with a separate buyer account to test that flow.
- The seller area lets an authenticated seller create and manage their listings.

## Test checkout with Stripe

Checkout uses Stripe test mode and card payments only. It requires a configured
test secret key, a migrated development database, and purchasable inventory
that is not owned by the buyer.

1. Start the API and web app with `npm run dev`.
2. In a separate terminal, start the Stripe CLI listener and forward the
   checkout events handled by the API:

   ```powershell
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,checkout.session.async_payment_failed --forward-to localhost:4000/api/webhooks/stripe
   ```

3. Copy the `whsec_...` signing secret printed by the CLI into
   `STRIPE_WEBHOOK_SECRET` in `api/.env`, then restart the API.
4. Sign in as the buyer, add a seller or imported product to the cart, and
   continue to checkout. Enter the requested delivery details.
5. On Stripe's test checkout page, use card number `4242 4242 4242 4242`, any
   future expiry date, any three-digit CVC, and any valid postal code.
6. Confirm the browser returns to Brightshelf and the order appears in Orders.
   Confirm the Stripe CLI reports delivery of the completed event and that
   repeating the event does not create a second payment/order transition.
7. Use only Stripe test keys and test card details. Do not use a real card or
   live-mode keys.

## Validation

Run the repository validation, all workspace tests, and lint:

```powershell
npm run validate
npm test
npm run lint
```

`npm run validate` checks API types and tests, web types and lint, and the
production web build. `npm test` also runs the web tests. `npm run lint` checks
both API and web source.

## Environment files

- `api/.env.example`: API, database, auth, SMTP, Redis, and Stripe settings.
- `web/.env.example`: API origin and web-side Google OAuth settings.
- `.env.example`: combined reference list for local and deployment setup.

Keep local `.env` files private. Production deployment and webhook setup are
not performed or verified by this local walkthrough.
