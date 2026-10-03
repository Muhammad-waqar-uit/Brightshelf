# Step-05 Foundation Build Prompt

Copy the prompt below into a new Brightshelf coding-agent session. The repository's configured capture hook should record the real prompt and final response. This file is a reusable instruction, not a session log.

---

Work only on Step-05 Foundation in `docs/roadmap.md`. Read `Agent.md`, `AGENTS.md`, `RULES.md`, `docs/progress.md`, and the Step-05 requirements in `docs/roadmap.md`. Then inspect `docs/spec.md`, `docs/tech-stack.md`, `docs/design.md`, the current source, and `git status` as needed for this step.

Use the approved stack: Next.js for `web/`, Node.js with Express for `api/`, Prisma, Supabase Postgres, and Vercel free projects. Do not use NestJS. Supabase Storage is only an available service; product image uploads are not part of this step or the approved product scope.

Make a short implementation plan, then execute only the foundation step. Do not begin S1 or any later roadmap slice. The work covers the web and API foundation, environment-variable templates, Prisma/Supabase database setup, an import of about 300 products from an approved free product API, and free Vercel deployments when the required credentials and accounts are available.

Before importing catalogue data, verify the chosen source's current terms, record count, image URLs, and suitability for this demo. DummyJSON is a candidate in the project documents, not an automatically approved or guaranteed source. If it cannot supply enough suitable records or permitted images, stop and ask before substituting another source. Do not use retailer logos, images, copy, or links.

Inspect the existing scaffold before changing it. Write focused tests before new API, seed, or data-layer behavior. Keep all database access in the Express API. Validate inputs, use migrations, keep queries bounded, and never expose database or service credentials to browser code. Do not add image-upload endpoints or UI.

Use only free services and dependencies. Never print or commit secrets. If credentials, provider setup, or account access are missing, finish the work that can be verified locally, leave explicit environment-variable names with empty values in `.env.example`, and report the exact external setup needed. Do not claim a deployment succeeded unless you verify the deployed URLs.

Before editing, inspect `git status`. Preserve all existing unrelated changes, including prior documentation edits, reference screenshots, and historical `.agent-logs/` records. Do not rewrite or backfill logs. Let the repository hook capture this actual session; if automatic capture fails, report the failure rather than constructing a log by hand. Stage only files belonging to the foundation step and its authentic generated session record.

If the session is close to its context, token, or time limit, stop at a safe boundary instead of rushing or starting S1. Update the Step-05 row in `docs/progress.md` with a concise checkpoint: completed sub-items, changed file paths, commands and outcomes, current blockers, uncommitted work, and the exact next action. Mark Step-05 `in_progress`, not `done`, unless every acceptance condition is verified. A new account or session must resume by reading `docs/progress.md`, checking `git status`, and continuing only the recorded Step-05 work. Do not rely on chat history as the handoff.

Run the focused tests, API and web type checks, lint, and production builds required by `RULES.md`. Keep `docs/roadmap.md` unchanged. At handoff, update the Step-05 row in `docs/progress.md` with verified results, blockers, deployed URLs if successful, and the next step. Commit and push only the scoped work when the required checks pass and the working tree review shows no unrelated files included. Stop before S1.
