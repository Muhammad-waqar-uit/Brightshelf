# Tech Stack Proposal

Status: Draft for approval. No application code has been started.

## Monorepo and languages

Use one Git repository with `web/` and `api/` as separate deployable applications. Use TypeScript in both, Node.js 22 LTS, and npm workspaces at the repository root.

- `web/`: Next.js App Router, React, TypeScript, and Tailwind CSS. Next.js provides routing, Server Components, Server Actions, and Vercel deployment support in one framework.
- `api/`: Node.js, Express, TypeScript, and Prisma. Keep data access and database credentials inside this service; Prisma gives typed queries and migrations.
- The browser calls the web application. Server Actions call the API over HTTPS. Server Components use server-side fetches for read operations. This keeps database access and shared secrets out of browser bundles and avoids a browser-to-API CORS dependency for normal app traffic.
- Use npm workspaces to install and run both packages from one repository. Vercel projects use `web/` and `api/` as their respective root directories.

## Rendering strategy

- Home and product pages: Incremental Static Regeneration (ISR). Pre-render the common product and home content, then revalidate on a short interval or invalidate affected tags after catalog updates. This gives fast initial loads while keeping data refreshable.
- Search and category results: Server-side rendering (SSR) from URL query parameters. Search terms, sorting, and filters remain shareable and are calculated against the current database contents rather than a stale static page.
- Cart drawer and checkout interactions: client components for interactive state and immediate feedback. Persist cart changes through Server Actions and the API; the server remains authoritative for prices and totals.
- Other pages: default to Server Components and server-side reads. Add client components only where interaction requires browser state.

## Database

Use Neon Free Postgres, accessed only from `api/` through Prisma. Use Neon's pooled connection string for serverless request traffic and keep migrations as an explicit deployment or setup task.

Current advertised Neon Free limits (checked 2026-10-02): 100 CU-hours per project per month, up to 2 CU autoscaling, 1 GB Postgres storage per project, 20 GB total storage across the account, 5 GB public network transfer per project, 10 branches per project, and automatic scale-to-zero after 5 minutes of inactivity. There is no uptime SLA. Compute suspends when CU-hour or egress allowance is exhausted; writes are blocked when storage limits are reached. These limits are adequate for a small assessment demo, not a production service with availability guarantees.

## Authentication and API trust

Use Auth.js in `web/` for Google OAuth and the authenticated web session. On the email sign-in screen, let users choose a one-time code or a sign-in link. Both email options use one API-owned challenge flow sent by Nodemailer through Gmail SMTP. A Server Action requests the selected mode from `api/`; the API generates a cryptographically random six-digit code or an opaque random link token, stores only a keyed hash with an expiry, and sends the email. Codes expire after 10 minutes; link tokens expire after 15 minutes. Each challenge is rate-limited by email and IP, limited to five verification attempts, and consumed only once. Auth.js uses a Credentials provider to establish the web session only after the API confirms the challenge and creates or finds the user. This avoids giving Auth.js direct database access and keeps Neon access inside `api/`. Keep codes, link tokens, and SMTP credentials out of logs.

Use a dedicated Gmail account with 2-Step Verification enabled and an app password. Configure `smtp.gmail.com` over TLS. Gmail account sending limits, anti-abuse controls, and account policy can affect delivery; this is suitable for a low-volume assessment demo, not guaranteed transactional email. Keep the app password only in the API deployment environment and verify current Gmail account requirements before setup. The API does not trust user IDs sent in request bodies.

After Auth.js authenticates a user, the web app issues a short-lived, HMAC-signed API session JWT containing the stable user ID and minimal claims. Store that JWT in a Secure, HttpOnly, SameSite=Lax cookie scoped to the web origin. A Server Action reads the cookie server-side and forwards the token to `api/` in an Authorization header. The API verifies the signature with a shared `JWT_SECRET`, and validates issuer, audience, and expiration before authorizing protected operations. Never expose the shared secret to client code. The API must not accept a JWT from arbitrary browser callers merely because it has a valid signature; validate claims and authorization on every protected operation.

Use SimpleWebAuthn for passkeys in Step-06 S7. Persist credential public keys, credential IDs, counter values, and user associations in Postgres. Keep challenges short-lived and single-use. Passkeys require a stable HTTPS origin and matching relying party ID.

## Hosting

Deploy two Vercel projects from the same public repository: Next.js from `web/` and the Express API as serverless functions from `api/`. Both use free `vercel.app` hostnames. Put each project's secrets and URLs in its own environment configuration. The API should remain stateless between requests and must not rely on in-memory sessions or background workers.

Current Vercel Hobby limits include 200 projects, 100 deployments per day, 100 deployments per hour, a 45-minute build limit, and a 100 MB CLI source upload limit. Function limits vary by runtime and configuration; verify the current runtime and execution duration limits when deploying the Express API. Hobby runtime logs are retained for one hour. Hobby use is intended for personal, non-commercial projects, so confirm the assessment demo fits Vercel's current plan terms. Limits and plan terms can change; check the live plan dashboard before deployment.

## Product data and images

Use DummyJSON's public products endpoints as seed input, and import the fetched records into Postgres once. Read products from Postgres at runtime rather than depending on DummyJSON availability. Preserve source image URLs from DummyJSON's image CDN for the demo; configure Next.js image handling for the approved host. DummyJSON is demo data, not a commercial catalog or availability guarantee. Confirm its current product count, image behavior, and usage terms before seeding. If it does not supply about 300 usable products, ask before changing the roadmap or adding another source. Do not use Amazon product images, logos, copy, or links.

## Testing

- Vitest for focused unit tests in `web/` and `api/`, including validation, pricing, authorization, and utility logic. It runs locally and has no hosted free-tier quota.
- Playwright for browser end-to-end tests in Step-07. Run locally and in a free CI allowance if available; browser binaries and hosted CI minutes are separate from Playwright and may have platform quotas.
- Test the production-like deployment path for authentication cookies and passkeys because local origins do not reproduce all production host constraints.

## Risks and simple fixes

- CORS and cookies across two `vercel.app` subdomains: browser cookies cannot be shared across unrelated `*.vercel.app` project hosts, and broad CORS does not solve that cookie boundary. Keep browser requests on `web/`; use Server Actions to forward the HttpOnly API JWT as a bearer token to `api/`. Restrict API CORS to the web origin for any explicitly required browser request.
- Passkey RP ID: the RP ID must match the web hostname, and credentials will not automatically work if the final hostname changes. Reserve the final web hostname before passkey implementation and configure the exact origin and RP ID from server environment variables.
- Google OAuth redirect URI: Google requires an exact callback URL match. Add the final web URL plus localhost development callback to Google OAuth configuration, then verify the production callback after the hostname is assigned.
- `brightshelf.vercel.app` may be taken: check hostname availability before configuring OAuth or passkeys. If unavailable, choose an available Brightshelf-branded Vercel hostname once, then use it consistently for OAuth, passkeys, environment variables, and documentation.
