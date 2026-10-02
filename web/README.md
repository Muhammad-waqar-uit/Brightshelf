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

Set `API_URL` for server-side API requests. The web server defaults to `http://localhost:3000`.