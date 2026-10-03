# Brightshelf Web

Next.js App Router application using TypeScript, Tailwind CSS, and ESLint.

## Structure

- `src/app/`: route pages and root layout.
- `src/components/`: shared header and footer.
- `src/components/ui/`: shared UI primitives.
- `src/lib/`: API client and small helpers.
- `src/actions/`: Server Actions.
- `src/types/`: shared web types.

## Commands

From the repository root, run `npm run dev --workspace web`, `npm run lint --workspace web`, `npm test --workspace web`, or `npm run build --workspace web`.

For local configuration, run `Copy-Item web\.env.example web\.env.local` from the repository root. `API_URL` is used only by server-side requests and defaults to `http://localhost:4000`; the web server defaults to `http://localhost:3000`. In the Vercel deployment, `API_URL` is injected by the web-to-api service binding and should not be configured manually. Never put database credentials or server-only secrets in `NEXT_PUBLIC_` variables.

The storefront's public API requests use `/api/...`. Vercel routes those requests to the API service, which retains the `/api` prefix.

Guest cart product IDs and quantities are persisted in browser local storage. Cart prices and totals are requested from the API and are never read from persisted client data. Signed-in cart storage and guest-cart merging are part of the account-access step.
