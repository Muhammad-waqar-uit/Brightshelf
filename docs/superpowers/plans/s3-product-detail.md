# S3 Plan: Product Detail

## Outcome

Provide a useful, factual detail view for a catalogue item and connect it to the cart flow.

## Work

- Load a product by stable identifier through the web data layer and Express API.
- Display only fields actually available in the approved seed data, including image, title, description, category, and current price.
- Add a working add-to-cart control that passes the product identifier and requested quantity to S4 behavior.
- Give unavailable products an intentional not-found state and show failures clearly.
- Use meaningful image alternatives and keep the layout usable at phone widths.

## Acceptance checks

- A seeded product renders accurate stored fields.
- An unknown identifier returns a not-found experience.
- Add-to-cart reports server success or failure without claiming success on errors.
- No stock, review, discount, or delivery claim is fabricated.
- Focused route and cart-integration tests pass.

## Not in this slice

Ratings, customer reviews, unsupported inventory indicators, or recommendations.
