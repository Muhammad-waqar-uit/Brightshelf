# Brightshelf Project Instructions

Read `docs/progress.md` at the start of every session. Then read only the single roadmap step being worked on.

## Rules

- Use free tools and free hosting only.
- Do not use emojis or long dashes in code, UI, or docs. Use a plain hyphen (`-`).
- The brand is Brightshelf. Follow Amazon-style layout and flows, but use no Amazon logo, images, copy, or links.
- Do one step at a time, then stop and update `docs/progress.md`.
- A working deployed version must always exist. Commit and deploy after every slice, and commit `.agent-logs/` as it is produced.
- Choose the simplest solution that works. Write clean, readable TypeScript. Add complexity only when no simple option exists.
- Add or change roadmap steps only after user approval.
- Ask at most one or two questions per step, only at real decision points.
- Follow this file at all times.
- Keep sessions short. Read only `docs/progress.md` and the single step being worked on.

## Project structure

- `web/`: Next.js App Router, TypeScript, Tailwind, and Server Actions.
- `api/`: Node.js, Express, TypeScript, and Prisma.
- `docs/requirements.md`: source brief, saved verbatim.
- `docs/roadmap.md`: approved work sequence and rules.
- `docs/strategy.md`: session loop and token-saving habits.
- `docs/progress.md`: step status and handoff notes.
- `docs/recon/`: reference-only screenshots. Never ship Amazon assets or copy.
- `.agent-logs/`: captured agent prompts and responses. Keep committed as work proceeds.
- `.env.example`: names and empty placeholders for required environment variables. Never commit real secrets.

## Session completion

After completing one step, run its focused checks, commit and push as directed by the roadmap, confirm the deployment, and update `docs/progress.md` with done, changed, next, and open issues. Then end the session.