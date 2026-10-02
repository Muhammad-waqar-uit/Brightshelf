# Brightshelf

Brightshelf is an Amazon-style e-commerce assessment project. This repository currently contains the empty web and API foundations only.

See [docs/](docs/README.md) for project notes and setup details.

## Start

```sh
npm install
npm run dev
```

The web app runs at `http://localhost:3000` and the API runs at `http://localhost:4000`.

## Workspaces

- `web/`: Next.js App Router application.
- `api/`: Express API and Prisma setup.
- `docs/`: project requirements, roadmap, and handoff notes.

Run checks across both workspaces with `npm run lint`, `npm test`, and `npm run build`.