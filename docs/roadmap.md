# Brightshelf Roadmap

## RULES

- Rule-1: Free tools and free hosting only.
- Rule-2: No emojis and no long dashes in code, UI or docs. Use a plain "-".
- Rule-3: The brand is Brightshelf. Follow Amazon-style layout and flows, but use no Amazon logo, images, copy or links.
- Rule-4: Do one step at a time, then stop and update docs/progress.md.
- Rule-5: A working deployed version must always exist. Commit and deploy after every slice, and commit .agent-logs/ as we go.
- Rule-6: Choose the simplest solution that works. Clean, readable TypeScript. Move to complexity only when no simple option exists.
- Rule-7: Add or change steps only after my approval.
- Rule-8: Ask at most one or two questions per step, only at real decision points.
- Rule-9: Follow Agent.md at all times.
- Rule-10: Keep sessions short. Read only docs/progress.md and the single step being worked on.

## STEPS

- [todo] Step-00 Capture setup: hooks logging prompts and responses to .agent-logs/, CAPTURE-TEST.md passing in two sessions, git init, public GitHub repo. I save amazon.com screenshots to docs/recon/ (reference only, never shipped).
- [todo] Step-01 docs/spec.md: every feature ranked must-have, nice-to-have or out of scope, plus where catalogue data and images come from.
- [todo] Step-02 docs/tech-stack.md: stack, rendering strategy, database, hosting, free-tier limits. Needs my approval.
- [todo] Step-03 Add feasible additions to Agent.md based on the spec and tech stack.
- [todo] Step-03b Engineering rules and git hooks. Approved by me.
- [todo] Step-04 docs/design.md: how each feature is built (frontend and backend), list of screens and flows, ending with an ordered slice plan, must-have first, each slice deployable on its own.
- [todo] Step-05 Foundation: scaffold web and api, database, .env.local plus .env.example, seed about 300 products from a free public product API, deploy both to free vercel.app addresses.
- [todo] Step-06 Slices, in this order, each with tests first, build, visual comparison with amazon.com, commit, deploy:
  - [todo] S1 Header, footer, home with category rails and hero
  - [todo] S2 Search and category results with price filter and sorting
  - [todo] S3 Product page
  - [todo] S4 Cart, persisted, guest cart allowed
  - [todo] S5 Email sign up and sign in with user choice of one-time email code or sign-in link, sent through Nodemailer and Gmail SMTP, plus Sign in with Google, protected routes
  - [todo] S6 Checkout with address and mock card payment, orders list and order detail
  - [todo] S7 Passkeys with SimpleWebAuthn, offered next to Google and email on the sign-in page
- [todo] Step-07 Hardening: end-to-end tests of browse, search, product, cart, checkout, orders and all three sign-in methods, plus a mobile pass, bug fixing, deploy.
- [todo] Step-08 README: what is built, how to run, live URL, trade-offs, how AI was used, and a five minute walkthrough outline that states what was left out and why.
- [todo] Step-09 Pre-submit check: live link opens signed out, repo is public, .agent-logs/ is committed, links labelled.

## CUT ORDER

If the window runs short, cut from the top: passkeys, filter extras, extra home rails. Never cut: search, product page, cart, checkout, email and Google sign-in.
