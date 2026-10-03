# Brightshelf Project Guide

Read `docs/progress.md` and the active step in `docs/roadmap.md` before working. Complete one roadmap step at a time. Do not start later work or add product scope without approval.

## Product direction

Brightshelf is an original general merchandise storefront for a technical assessment. Use its own name, visual identity, and interface copy. Screenshots in `docs/reference/` are design research only and must not ship with the storefront. Do not use another retailer's branding, photographs, wording, or links.

The approved customer journey covers storefront discovery, search, product details, a guest or account cart, sign-in, mock checkout, and order history. Passkeys are a later optional slice. Reviews, saved lists, seller tools, support, and other unapproved features remain out of scope. Mock payment is not a real charge.

## Application structure

- `web/`: Next.js App Router, React, TypeScript, and Tailwind CSS.
- `api/`: Node.js, Express, TypeScript, and Prisma.
- Database: Supabase Postgres.
- File storage: Supabase Storage is an available service, not an approved image-upload feature.
- Hosting: free Vercel projects for web and API, within current plan limits.
- Catalogue: about 300 records from a free public product API, after verifying its terms, usable records, and image URLs.

The existing API scaffold uses Express. Keep it as the single API framework.

## Application boundaries

- Keep database access in API modules and services. Browser code must never connect directly to Postgres.
- Prefer Next.js Server Components for reads. Add client components only for interaction.
- Server Actions validate browser input and forward mutations to Express. API services own business rules and authoritative writes.
- Validate request bodies, query parameters, and route parameters at the API boundary.
- Derive identity from a verified session. Check ownership on every protected cart and order operation.
- Re-read product prices and cart contents on the server before recording an order. Never trust browser totals.
- Treat guest cart contents as untrusted and validate them before accepting or merging them.
- Bound list responses. Return clear loading, empty, validation, and error states in the interface.
- Do not add upload routes, forms, or storage policies until an upload workflow is approved.

## Authentication

For S5, implement Google sign-in and let the customer choose between an email one-time code and a sign-in link, as specified in the roadmap. Passkeys are a separate optional S7 slice.

Keep verification tokens, cookies, OAuth credentials, SMTP credentials, database URLs, and signing keys out of browser bundles and logs. The API enforces authorization even when the interface hides protected actions.

## Engineering and cost

- Use free services and dependencies. Ask before introducing paid usage or billing requirements.
- Use strict TypeScript and avoid `any`. Follow `RULES.md` for imports, tests, formatting, commits, and validation.
- Keep `.env.example` aligned with environment variables. Never commit actual credentials.
- Preserve `.agent-logs/` as automatic evidence. Do not fabricate, edit, or delete historical entries. Commit authentic generated records with the work they document.
- Keep design screenshots in `docs/reference/`. Do not include them in the deployed site.
- Update `docs/progress.md` when the active roadmap step is complete. Do not claim checks or deployments that were not verified.

## Documentation map

- `docs/assignment.md`: original assessment brief.
- `docs/spec.md`: Brightshelf product scope and priorities.
- `docs/tech-stack.md`: approved technology choices and provider limits.
- `docs/design.md`: screen behavior, API responsibilities, and delivery slices.
- `docs/roadmap.md`: approved work order.
- `docs/progress.md`: current status and handoff.
- `docs/reference/`: reference-only screenshots.
- `docs/superpowers/plans/`: supplemental implementation plans for approved slices.
- `docs/superpowers/prompts/`: reusable prompts for roadmap work. These are not session logs.

## Session completion

Run the focused checks required for the active step. Follow the roadmap's commit and deployment requirements, update the progress handoff, and stop before beginning the next step.
