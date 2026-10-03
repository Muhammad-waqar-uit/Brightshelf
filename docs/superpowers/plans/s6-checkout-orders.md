# S6 Plan: Checkout and Orders

## Outcome

Complete the demo purchase journey with address validation, simulated payment, server-created orders, and customer order history.

## Work

- Collect and validate the delivery address through the approved API contract.
- Require the account/session behavior specified by the roadmap and preserve the guest cart when sign-in is needed.
- Re-read the cart and product prices on the server at order submission.
- Calculate order totals in the API and persist a snapshot of the order and its line items.
- Treat the card step as simulation only. Do not collect or persist real card numbers.
- Clear the correct cart only after order creation succeeds.
- Add a bounded order list and order detail read that enforce user ownership.

## Acceptance checks

- Successful mock checkout creates one persistent order with server-calculated totals.
- Invalid address, empty cart, changed product state, and database failure do not produce a success result or clear the cart.
- The owner can see their order list and detail; another account cannot retrieve it by changing an identifier.
- Empty history and unknown order identifiers have useful states.
- API and browser tests cover the success and failure paths.

## Not in this slice

Real payment processing, refunds, fulfilment promises, shipment tracking, or unsupported order states.
