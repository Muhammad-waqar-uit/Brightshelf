# AGENTS.md - Working Agreement for AI Agents

Single source of truth for AI coding agents in this repo. Read it, CLAUDE.md, RULES.md and docs/progress.md before any change.

## 0. Project snapshot

Brightshelf is an Amazon-style store built for a timed technical assessment. Monorepo:

- web/ Next.js App Router, TypeScript, Tailwind, Server Actions.
- api/ Node.js, Express, TypeScript, Prisma, PostgreSQL (Neon).
- docs/ requirements, roadmap, strategy, progress, spec, tech-stack, design.
  The brand is Brightshelf. No Amazon logo, images, copy or links.

## 1. Validation commands (run from repo root)

npm run validate
cd api && npm test && npx oxlint src/
cd web && npx tsc --noEmit && npx oxlint src/ && npx next build

## 2. Session rules

- Read only docs/progress.md and the single step being worked on.
- Do one step, then update docs/progress.md, commit, push, confirm the deploy, and stop.
- Add or change roadmap steps only after my approval.
- Ask at most one or two questions per step.
- No emojis and no long dashes in code, UI or docs. Use a plain "-".
- Commit .agent-logs/ together with the code.

## 3. Backend architecture (api/)

- src/app.ts exports the Express app; src/server.ts only listens.
- src/config and lib/env.ts validate env with zod and fail fast on missing values.
- routes/ define paths only, controllers/ handle transport, services/ hold use cases and Prisma access, middleware/ holds auth, validation and error handling, types/ holds shared types.
- Controllers get the user from the verified token, never from the body.
- Prisma schema changes use migrations. Every hot column is indexed.

## 4. Auth contract

- Methods: email and password, Sign in with Google, passkeys (SimpleWebAuthn).
- The session is a signed JWT in an httpOnly, secure, sameSite cookie. The api verifies it with a shared secret.
- Whatever the sign-in method, the result is the same session cookie.
- Passkey RP ID and origin come from env (WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN) and must match the deployed address.
- Google OAuth redirect URI must match the final deployed address.
- Protected routes are checked on the server (middleware or server component), and the client only mirrors that.

## 5. Frontend architecture (web/)

- Server components fetch read data from the api. Client islands handle interactivity.
- Server Actions handle mutations (add to cart, place order, sign in). A Server Action is a thin transport layer: parse input with zod, read the session cookie, call the api, return a typed result. Business logic stays in api/ services.
- A Server Action does not automatically carry the user. Always forward the session explicitly.
- Never read secrets in client components. Only NEXT_PUBLIC_ variables reach the browser.
- The client component that triggered an action updates its own state from the action result. Do not mirror server state in two places.
- The guest cart lives in a cookie or storage until sign-in, then merges into the account cart.
- Rendering: ISR for home and product pages, SSR for search results, client-only for the cart drawer and checkout interactions.

## 6. Security basics

helmet on, login rate limited, zod on every input, passwords hashed, no secrets in git, .env.local ignored, .env.example kept in sync. Whenever a process.env read is added, update .env.example in the same commit.

## 7. When changing API routes

If an endpoint is added, renamed or removed, update the api and every web caller in the same change, and update docs/design.md if the contract changes.

## 8. Checks before finishing a step

Run npm run validate. Confirm the deployed version still works, then update docs/progress.md.
