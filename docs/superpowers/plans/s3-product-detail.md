# S3 Plan: Product Detail

## Outcome

Provide a useful, factual detail view for a catalogue item and connect it to the cart flow.

## Work

- Load a product by stable identifier through the web data layer and Express API.
- Display only fields actually available in the approved seed data, including image, title, description, category, and current price.
- Defer the working add-to-cart control to S4 so the product detail action ships with its API-backed cart behavior.
- Give unavailable products an intentional not-found state and show failures clearly.
- Use meaningful image alternatives and keep the layout usable at phone widths.

## Acceptance checks

- A seeded product renders accurate stored fields.
- An unknown identifier returns a not-found experience.
- No stock, review, discount, or delivery claim is fabricated.
- Focused product-route and web data-layer tests pass.
- S4 adds and tests the product detail add-to-cart action with the cart API.

## Not in this slice

Ratings, customer reviews, unsupported inventory indicators, or recommendations.
