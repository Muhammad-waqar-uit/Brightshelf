# S7 Plan: Passkeys

## Status

Optional roadmap slice. Start only after the core purchase journey works and the owner confirms the approved S5 session contract.

## Outcome

Offer passkey registration and authentication as an additional way to establish the same Brightshelf account session.

## Work

- Use SimpleWebAuthn and persist each credential's identifier, public key, counter, and owning user in Supabase Postgres.
- Keep ceremony challenges short-lived, single-use, and bound to the active session.
- Configure the relying party ID and allowed origin from server environment and the final HTTPS web hostname.
- Verify the assertion on the server, update the signature counter, and issue the same session used by the other approved sign-in methods.
- Provide usable unsupported-browser, cancelled, expired, and failed-assertion states.

## Acceptance checks

- Registration associates a valid credential with the currently authenticated user.
- Authentication verifies challenge, origin, relying party, and credential ownership on the server.
- Replayed or invalid assertions do not establish a session.
- Tests cover successful verification and important rejection paths on the deployed HTTPS origin.

## Not in this slice

Replacing the approved email or Google sign-in flow, or starting passkeys before core checkout and orders are complete.
