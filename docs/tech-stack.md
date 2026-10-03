# Brightshelf Technology Plan

Status: The owner approved Next.js, Node.js with Express, Supabase Postgres, and Supabase Storage on 2026-10-03. Storage is an available platform capability only; an image-upload feature is not in the approved product scope.

## Workspace and runtime

Keep the existing npm-workspace repository with `web/` and `api/` as separate applications. Use strict TypeScript and Node.js 22.

- `web/`: Next.js App Router, React, and Tailwind CSS. Keep Server Components as the default and add client components only for browser interaction.
- `api/`: Node.js, Express, TypeScript, and Prisma. Keep the Express application in `src/app.ts` and the process listener in `src/server.ts`, following the existing scaffold.
- Keep Express as the sole API framework.
- Run local development and tests through the existing npm workspace scripts. Keep server credentials out of browser bundles.

## Rendering and request flow

- Render catalogue pages on the server. Use Next.js revalidation for shared home and product data where freshness permits.
- Search and category pages read validated URL parameters and request current, bounded results from Express API routes.
- Server Actions validate browser input and call the API for mutations. The API revalidates product and cart data and owns business rules.
- Keep per-user cart, order, and authentication data out of shared caches.
- Give every data-driven route a loading state and visible empty and error states.

## Database and ORM

Use Supabase Postgres with Prisma. The Express API is the only application service that connects to Postgres. Do not expose the database URL to Next.js client code.

For Vercel's serverless API deployment, use Supabase's Supavisor transaction pooler for runtime queries and its session pooler or direct connection for migrations. Prisma's transaction-pool connection uses the documented `pgbouncer=true` parameter. Keep separate `DATABASE_URL` and `DIRECT_URL` values, and use the direct/session URL for migration operations. Verify the exact connection strings in the Supabase dashboard before deployment.

Create indexes for catalogue filters, joins, and ordering. Bound list queries and keep schema changes in committed Prisma migrations.

## Supabase plan limits and availability

Supabase Free was checked on 2026-10-03. The published allowances include 500 MB of database size per project, 1 GB of file storage, 5 GB of egress, 5 GB of cached egress, and two free projects per account. Free projects may pause after one week of inactivity. The free plan has no production uptime guarantee, and its quotas and terms can change.

These limits are adequate for a small assessment catalogue and demo only if the seed data and traffic remain within quota. A paused project can make the live backend unavailable until resumed, so confirm its status before a presentation or submission. Do not add paid compute, storage, custom domains, or overage without the owner's approval.

## File storage boundary

Supabase Storage is approved as an available service, not as an upload feature. The current product scope imports catalogue image URLs from the approved data source and contains no owner dashboard or product-image upload flow. Do not add upload routes, forms, buckets, or client permissions as part of the current slices.

If a future approved feature needs uploaded files, implement it through the Express API or a specifically approved signed-upload flow. Validate file type, size, ownership, and object path; keep privileged Supabase credentials on the server; and apply restrictive bucket policies. The free plan currently includes 1 GB of file storage, so enforce an explicit product limit if uploads are later approved.

## Catalogue source

The roadmap calls for about 300 products from a free public product API. DummyJSON is the candidate named in the project proposal, not yet a verified or guaranteed source. Before import, confirm its current terms, available product count, image URLs, and suitability for the demo.

Import approved records once into Postgres and serve the catalogue from Brightshelf's API. Do not depend on the upstream API for live page requests. Configure Next.js remote image handling for the verified image host. If the source cannot provide enough suitable products, ask before substituting another source.

## Authentication and API trust

For S5, follow the roadmap: Google sign-in plus a customer choice of email one-time code or sign-in link, delivered through Nodemailer and Gmail SMTP. Passkeys remain the later, optional S7 slice.

Whichever method is approved, the API must verify the session and enforce ownership on every protected operation. Do not accept a user ID or order total as proof from the browser. Keep OAuth secrets, SMTP credentials, Supabase service credentials, database URLs, and signing keys in server-side environment variables. Do not log authentication codes or bearer tokens.

## Hosting

Deploy the repository as one Vercel project using Vercel Services: `web` uses `web/` and Next.js, while `api` uses `api/` and Express. Public requests matching `/api/*` route to `api`; all other public requests route to `web`. Express mounts endpoints under `/api`, because service rewrites preserve the original path. The `web` service binds to `api` as `API_URL`; Vercel injects this URL at runtime, so do not manually set `API_URL` in Vercel project environment variables. Keep the API stateless between requests and verify function runtime, bundle, and request limits before deployment.

The home page is runtime-rendered so it can use the injected service binding, which is not available during builds. This is an intentional exception to the shared-catalogue ISR goal; product and search routes must likewise avoid build-time API calls.

Vercel Hobby limits checked on 2026-10-03 include 200 projects, 100 deployments per day, 25 projects connected to a Git repository, and a 120-second proxied request timeout. Confirm current plan terms and function limits before deploying. Hobby use is not a substitute for a production service guarantee.

Keep browser traffic on the web origin. Server-side Next.js code calls Express and forwards only the required verified session. Do not rely on cookies being shared across separate Vercel hostnames or use permissive credentialed CORS.

## Testing

- Use Vitest for focused web and API tests, including validation, session authorization, catalogue queries, cart rules, and order creation.
- Use the repository's required type checks, linting, and builds for each affected workspace.
- Add Playwright coverage for the complete shopping flow during the roadmap's hardening step.
- Verify the deployed authentication callback URLs, API connectivity, Supabase connection mode, and passkey origin if S7 is approved.

## Environment and cost controls

Keep `.env.example` aligned with environment variables used by the code. Expect separate web and API settings for public API origin, Supabase URL, storage credentials when needed, pooled database URL, migration connection URL, OAuth, SMTP, and session signing. Use empty placeholders only; never commit actual credentials.

All implementation and deployment choices must remain within free plans. Recheck provider quotas before setup and before submission. If a requirement would need paid usage, pause and ask the owner for direction.

## Current provider references

- [Supabase Prisma connection guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase pricing](https://supabase.com/pricing)
- [Express on Vercel](https://vercel.com/kb/guide/ship-an-express-app-on-vercel)
- [Vercel limits](https://vercel.com/docs/limits)
