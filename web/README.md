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

For local configuration, run `Copy-Item web\.env.example web\.env.local` from the repository root. `API_URL` is used only by server-side requests and defaults to `http://localhost:4000`; the web server defaults to `http://localhost:3000`. Never put database credentials or server-only secrets in `NEXT_PUBLIC_` variables.
