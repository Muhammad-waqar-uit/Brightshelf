# Brightshelf

Brightshelf is an independently designed general merchandise storefront for a technical assessment.

See [docs/](docs/README.md) for project notes and setup details.

## Start

```sh
npm install
npm run dev
```

The web app runs at `http://localhost:3000` and the API runs at `http://localhost:4000`.

The root `vercel.json` configures a Vercel Services deployment with public `/api/*` routing to Express, all other paths to Next.js, and a web-to-api service binding.

## Workspaces

- `web/`: Next.js App Router application.
- `api/`: Express API and Prisma setup.
- `docs/`: project requirements, roadmap, and handoff notes.

Run checks across both workspaces with `npm run lint`, `npm test`, and `npm run build`.
