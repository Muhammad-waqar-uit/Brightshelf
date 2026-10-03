# S1 Plan: Storefront Shell and Home

## Outcome

Give visitors a responsive Brightshelf frame and a data-backed starting point for product discovery.

## Work

- Complete the shared header and footer using the existing app layout and components.
- Add the roadmap's home hero, category entry points, and catalogue-backed product sections.
- Wire search, category, cart, account, and product-card navigation to implemented Brightshelf routes.
- Keep product content in the API/data layer rather than embedding fixtures in page components.
- Add clear data loading, empty, and error states.

## Acceptance checks

- Header, footer, navigation, and home content work at desktop and phone widths without horizontal overflow.
- The home page can render the seeded catalogue and has an intentional result if catalogue data is unavailable.
- Every visible control has a working route or action and an accessible name.
- Product links remain within Brightshelf.
- Focused component/API tests and the web build pass.

## Not in this slice

Search behavior beyond navigation entry, product detail behavior, cart mutation, and unapproved promotional content.
