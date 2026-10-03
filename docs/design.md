# Brightshelf Experience and System Design

## Product experience

Brightshelf is a compact general merchandise shop. The interface should make the catalogue easy to browse and make the next shopping action clear. Use Brightshelf's own visual identity, layout details, and writing. The screenshots in `docs/reference/` are research material for interaction patterns; they are not assets for the site.

- Build one fluid layout that works on desktop and narrow screens.
- Keep shared header, footer, form, and feedback patterns consistent.
- Make every visible control perform a real action or navigate to a working page.
- Provide accessible names, labelled fields, visible keyboard focus, and usable dialogs.
- Show honest loading, empty, validation, and failure states.
- Use catalogue facts as supplied. Do not invent ratings, stock, discounts, shipping promises, or review content.
- Identify checkout payment as simulated. Do not collect real card details.

## Screens and customer flow

### Storefront and home

The shared shell provides the Brightshelf identity, category navigation, search entry, cart access, and account entry. The home page uses the approved catalogue to show the roadmap's hero area, categories, and product sections. Each product card links to its Brightshelf detail page.

### Search and category results

Search and category pages represent query, category, price bounds, sort order, and page state in the URL where practical. The server requests a bounded result set from the API. Empty results and invalid filters have explicit outcomes.

### Product detail

The product page loads by stable catalogue ID and presents the available product image and factual fields. Missing products receive a not-found state. Add-to-cart sends the product identifier and quantity to the cart flow; the server reads the current product and price.

### Cart

Guests can keep a cart without signing in. Signed-in carts are stored for the authenticated user. Cart actions support adding an item, changing quantity, and removing an item. The API validates product availability and quantity and returns current prices and totals. A guest cart merge, if used at sign-in, is validated by the API rather than trusted as an account cart.

### Sign-in

The roadmap requires Google sign-in and a choice of email one-time code or sign-in link. All successful methods must resolve to the same server-verifiable session. Passkeys remain the later optional S7 slice.

### Checkout and orders

Checkout requires the approved account flow, collects a validated address, and presents a clearly simulated payment step. On submission the API reloads the cart and product prices, computes the order amount, creates a persistent order, and clears only that account's cart after success. Customers can view their own order list and order detail.

### Passkeys

Passkeys are an optional follow-on to the approved S5 session design. Implement them only after core checkout and orders work and the deployment has a stable HTTPS hostname suitable for WebAuthn.

## Application responsibilities

### Next.js web application

- Use App Router pages and layouts for the storefront and account-facing routes already scaffolded under `web/src/app/`.
- Use Server Components for catalogue and order reads where appropriate.
- Use small client components only for interactive controls such as search suggestions, cart updates, checkout fields, and passkey prompts.
- Use Server Actions as validated transport for browser mutations. Forward the current session explicitly when calling the API.
- Keep API credentials, database connection strings, OAuth secrets, SMTP credentials, and signing keys server-side.

### Express API

- Keep the API in the existing Node.js and Express workspace under `api/`.
- Keep `src/app.ts` as the exported application and `src/server.ts` as the listener.
- Organize route definitions, request validation, controllers, services, and Prisma access according to the patterns already established by the project.
- Validate body, query, and route inputs at the API boundary.
- Derive the current user from a verified session. Enforce ownership on cart and order reads and writes.
- Bound and index list queries. Return consistent errors without hiding internal failures as successful responses.

### Supabase Postgres and Storage

Prisma connects to Supabase Postgres from the Express API. Use the runtime pooler and separate migration connection described in `docs/tech-stack.md`. Keep schema changes in migrations.

Supabase Storage is an available service only. The approved product has no image-upload workflow, admin catalogue editor, or upload API. Catalogue images continue to come from the verified seed source. Do not create upload UI or endpoints as part of these slices.

## Data and request flow

1. A page or Server Action validates the requested operation.
2. The Next.js server calls the Express API with only the required session and input.
3. The API authenticates and authorizes the operation, reads or updates Postgres through Prisma, and returns a typed result.
4. The web layer renders the result or a visible error state.

Product, price, cart, and order values returned by the API are authoritative. Do not put per-user data in a shared cache. Shared catalogue reads may be revalidated; mutations that affect visible cached data must invalidate the relevant entries.

## Slice delivery and acceptance

Deliver the work in the order approved in `docs/roadmap.md`. The detailed task plans are in `docs/superpowers/plans/`. S1 through S6 form the core shopping flow; S7 is optional and should be deferred if time is limited.

For every slice:

- Start with focused tests for behavior or API contracts.
- Implement one end-to-end slice without expanding scope.
- Check validation, failure, loading, and empty states in addition to success.
- Verify responsive behavior and compare interaction hierarchy against `docs/reference/`.
- Run the affected workspace checks and the roadmap-required build.
- Keep the deployed baseline usable, update `docs/progress.md`, and hand off before beginning the next slice.

## Delivery sequence

1. S1: shared shell and home.
2. S2: search and category results.
3. S3: product detail.
4. S4: guest and signed-in cart.
5. S5: approved email and Google sign-in contract.
6. S6: mock checkout and order history.
7. S7: optional passkeys.
8. Step-07: end-to-end hardening and mobile verification.
9. Step-08: project README and walkthrough outline.
10. Step-09: public deployment, repository, capture-log, and submission checks.

The foundation step precedes these slices and covers the Express API, Supabase connection, migrations, approved catalogue seed, and initial free deployments.
