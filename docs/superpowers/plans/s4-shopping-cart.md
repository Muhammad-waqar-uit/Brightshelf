# S4 Plan: Shopping Cart

## Outcome

Let guests and signed-in customers inspect and update their cart using server-validated catalogue data.

## Work

- Choose the simplest guest-cart persistence mechanism compatible with the existing web app.
- Store authenticated carts through API operations that derive and verify the current user.
- Support add, quantity update, and remove operations with visible pending and result feedback.
- Validate product identifiers and quantity bounds in the API. Re-read current product prices and availability before returning totals.
- If the approved sign-in flow merges a guest cart, validate every incoming item and report items that cannot be retained.

## Acceptance checks

- Guest cart survives refresh according to the selected persistence mechanism.
- A signed-in customer can only read or modify their own cart.
- Invalid quantity, missing product, and API failure are handled visibly.
- Displayed prices and totals come from the server.
- Success and failure tests cover guest and authenticated flows.

## Not in this slice

Saved lists, wishlists, checkout order creation, or client-authoritative price calculations.
