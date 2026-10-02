# RULES - Build and Commit Standards

Every commit must pass lint-staged and commitlint. Every push must pass `npm run validate`. Run it before pushing.

## 1. Git hooks (mandatory)

Hooks are installed with Husky.

- pre-commit: runs lint-staged on staged files only (oxlint --fix and prettier --write).
- commit-msg: validates the message with commitlint.
- pre-push: runs `npm run validate` (api type-check and tests, web type-check and next build).
  Never use `--no-verify` or any other way around the hooks. If a hook fails, fix the cause.

## 2. Linting

- Tool: oxlint for both workspaces. Commands: `cd api && npx oxlint src/` and `cd web && npx oxlint src/`.
- Prettier formats json, md, css and source files. Config at the repo root.

## 3. TypeScript

- Both workspaces use the same exact pinned TypeScript version (no caret). Do not upgrade during the build window.
- Strict mode on. Zero `any` in both projects, including `Record<string, any>`. Use `unknown` and narrow it.
- Do not use deprecated compiler options (for example `baseUrl`). Use `paths` only.
- Catch with `catch (err: unknown)`. Shared helpers: `getErrorMessage(err: unknown)` and `ApiError` in `web/src/lib/api.ts`.

## 4. Import style

Type-only imports use the `type` modifier.
Correct: import { type Product, getProducts } from '@/lib/products';
Wrong: import { Product, getProducts } from '@/lib/products';

Never use `../../` chains between folders. Use the `@/` alias for anything outside the current folder. Same-folder imports (`./sibling`) stay relative.

- web: `@/*` maps to `src/*` (Next.js resolves it).
- api: `@/*` maps to `src/*` in tsconfig paths. The production build is `tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json`. Never remove tsc-alias, or the compiled output will crash at runtime. tsx resolves the alias in dev and vitest uses vite-tsconfig-paths.

## 5. Next.js config

- Use the config file the scaffold created. Do not keep two config files.
- Product images come from a remote CDN. Allow it with `images.remotePatterns` (never `images.domains`).

## 6. Vercel

- Two projects from this repo: web (root directory web/) and api (root directory api/, Express app exported from src/app.ts and wrapped for serverless).
- The api build must compile before deploy. Keep app.ts (the Express app) separate from server.ts (listen).

## 7. Commit messages

Format: type(scope): description
Valid types: feat, fix, chore, docs, style, refactor, test, build, ci, perf, revert.
Body lines max 100 characters. Examples:

- feat(cart): add quantity stepper
- fix(search): reset page when filters change
- chore: update gitignore
  Add the trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>` to commits made by the agent.

## 8. Lock files

Commit the root package-lock.json. After changing any package.json, run npm install and commit the updated lock file. Never commit node_modules, dist, .next or *.tsbuildinfo. Never ignore .agent-logs/.

## 9. Branches

- main is production and is deployed. Work happens on main in small commits, or on a short-lived branch merged the same session.
- Push to origin after every commit: `git push origin main`.

## 10. Frontend React patterns (mandatory)

1. Shared hooks for repeated logic. No hand-rolled useState plus useEffect fetch pairs per page. Reusable hooks live in web/src/hooks (useAsync for one-shot data, useDebounced for search boxes).
2. Composition. Pass children instead of ten props. Keep prop drilling shallow.
3. Early returns. Handle each case first, then render, never nested ternaries:
   if (loading) return <Skeleton />;
   if (error) return <ErrorState message={error} />;
   if (!data) return <NotFound />;
   return <Content data={data} />;
4. State colocation. If only one component reads a piece of state, the state lives in that component. A keystroke in the search box must not re-render the whole page.
5. Derived state. Counts, totals, filtered lists and formatted values are computed at render. Never keep a second useState that mirrors a calculation.
6. Server components by default. Use client components only for interactivity (cart drawer, filters, checkout, passkey button).
7. Every route with data has a loading.tsx skeleton and every failure path shows a visible, clear error state.
8. Styling uses Tailwind theme tokens defined once in globals.css. No ad-hoc hex colors scattered across components. Reuse small primitives in components/ui before writing new markup.

## 11. Backend performance and safety rules (mandatory)

1. Index every column used in WHERE, JOIN or ORDER BY on a list endpoint, with `@@index` in schema.prisma. Prefer composite indexes that match the query (for example category and price).
2. No N+1 queries. Never await a query inside a loop over rows. Use Prisma `include`, `findMany` with `in`, or a single grouped query.
3. Bounded responses. Every list endpoint paginates or has an explicit cap (take). Default page size 24, max 100.
4. Cache hot read-only data (categories, home rails) with a small TTL in memory or through Next.js revalidation. Invalidate on write paths. Never cache per-user data.
5. Neon: use the pooled connection string, one shared Prisma client, never one client per request.
6. Compression middleware is on. Register all middleware before routes.
7. Validate every request body, query and param with zod. Never trust identity from the request body. Derive the user from the verified session token.
8. Passwords hashed with a strong algorithm (argon2 or bcrypt). Login rate limited. No secrets or fallback credentials in code.
9. CORS uses an explicit allowlist from WEB_ORIGIN. Never "*" with credentials.
10. Consistent error shape from one central error handler: { error: { code, message } }.

## 12. Reference checklist (every feature must have)

Backend: typed request user, zod validation on every route, central error handler, indexed queries, paginated lists, health endpoint, documented env vars in .env.example.
Frontend: typed api client with ApiError, shared fetch hooks, loading and error and empty states, responsive layout down to mobile, keyboard-visible focus, accessible dialogs and forms, no emojis in UI.
