# S5 Plan: Account Access

## Outcome

Provide the account creation and sign-in methods approved by the Brightshelf roadmap, with one secure session contract for protected API calls.

## Work

- Implement Google sign-in and the approved email challenge method through the existing web/API boundaries.
- Let customers choose between the roadmap's email code and email sign-in link options.
- Deliver email challenges through Nodemailer and Gmail SMTP, with credentials kept server-side.
- Keep verification state short-lived and single-use; rate-limit challenge creation and verification attempts.
- Store secrets only in server-side environment variables and never log codes, tokens, or OAuth credentials.
- Establish a session that the Express API can verify and use for ownership checks.
- Return clear invalid, expired, pending, and recovery states.
- Merge a guest cart only after successful sign-in and only after API validation.

## Acceptance checks

- Tests cover account creation, both email delivery choices, approved sign-in paths, expired or invalid challenges, and protected API authorization.
- A valid sign-in produces the same verified session behavior regardless of the selected approved method.
- An unauthenticated request cannot access another user's cart or orders.
- Production callback and cookie settings match the deployed origins.

## Not in this slice

Passkeys, which have a separate optional S7 plan.
