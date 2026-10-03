# Brightshelf Product Specification

## Product purpose

Brightshelf is a small, working online store built for a technical assessment. It gives shoppers a clear way to discover products, search the catalogue, manage a cart, and complete a demo order. The product uses its own name, visual identity, page copy, and implementation. Reference screenshots inform interaction research only; they are not product assets.

## Users and main journey

A visitor can browse the home page, search or open a category, view a product, and add it to a guest cart. The visitor can create an account or sign in, proceed through checkout using a clearly identified mock payment, and view the resulting order. Account data and protected actions are controlled by the API.

## Feature priorities

### Must have

- A responsive storefront shell with shared header, footer, search entry, and working navigation.
- A home page with category entry points and catalogue-backed product sections.
- Search and category results with price filtering, sorting, and useful empty and error states.
- Product detail pages with catalogue facts and a working add-to-cart action.
- A cart that supports guests and signed-in customers, including quantity changes and removal.
- Account creation and sign-in using the methods approved for the project. The roadmap specifies Google plus a choice of email code or sign-in link.
- Checkout with address entry, a visibly simulated card payment, server-created orders, an order list, and order details.
- A public deployment that can be opened while signed out, focused automated checks, and a short submission walkthrough.
- Automatic prompt and final-response capture in `.agent-logs/`, with verified setup and committed records as required by the assessment.

### Nice to have

- Passkeys as the separate S7 slice, after the primary shopping and checkout journey works.
- Additional home sections or search refinements where the approved roadmap and remaining time allow them.

### Out of scope

- Real card processing, fulfilment, or claims that the demo provides production-grade availability.
- Reviews, ratings, wishlists, saved lists, browsing history, deals, support requests, seller features, or a standalone account dashboard.
- Paid services, paid dependencies, or any feature not approved through the roadmap.
- Another retailer's brand assets, product photography, interface copy, or outbound links.

## Catalogue data and images

The roadmap calls for seeding about 300 products from a free public product API. The current stack proposal names DummyJSON as a candidate data source and its hosted product image URLs as candidate demo imagery. Before importing, confirm that the source currently provides enough usable records, permits the intended demo use, and serves images in the required form.

Import the approved records into Brightshelf's database and read the catalogue through the application's data/API layer. Do not depend on the upstream API for each customer page request. Keep the imported source identifiable so the catalogue can be replaced if its availability or terms change. Do not use images or product copy taken from another retailer.

## Behavior and data ownership

- Search terms, category selection, sort order, and price limits should be represented in the URL where practical.
- The API validates all inputs and remains authoritative for product prices, cart contents, and order totals.
- The browser must not determine the amount recorded for an order. Checkout re-reads current product and cart data on the server.
- Guest cart contents are untrusted until the server validates product identifiers and quantities.
- Every read or write of an account-owned cart or order checks ownership against the verified session.
- Mock payment must be clearly labelled and must not collect or send real card details.
- Screens provide clear loading, empty, validation, and failure states. A failed request must not appear successful.

## Checks before setup

- The owner approved the stack in `docs/tech-stack.md`: Next.js, Node.js with Express, Prisma, Supabase Postgres, and Supabase Storage capability.
- Follow the roadmap authentication contract: Google sign-in and a customer choice between email code and sign-in link. Passkeys remain the separate optional S7 slice.
- Verify the catalogue source's current terms, usable item count, and image URLs before importing it. DummyJSON remains a candidate, not an assumed permanent dependency.

## Delivery boundary

Use `docs/roadmap.md` as the approved order of work. Complete and hand off one step at a time. Do not add features or reorder slices without the owner's approval.
