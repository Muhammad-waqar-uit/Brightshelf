# Brightshelf API

Express API using TypeScript, Zod environment validation, and Prisma for PostgreSQL. The API is split into an importable Express app and a local listener.

## Structure

- `src/app.ts`: Express middleware, health endpoint, route mounting, and error handling.
- `src/server.ts`: local HTTP listener.
- `src/routes/`: products, cart, auth, and orders route placeholders.
- `src/controllers/`: request handlers.
- `src/services/`: application services.
- `src/middleware/`: Express middleware.
- `src/lib/`: environment validation and shared Prisma client.
- `src/types/`: API types.
- `prisma/schema.prisma`: PostgreSQL datasource and product catalogue model.
- `prisma/migrations/`: committed database schema migrations.

## Commands

From the repository root, run `npm run dev --workspace api`, `npm run lint --workspace api`, `npm test --workspace api`, or `npm run build --workspace api`.

For local configuration, run `Copy-Item api\.env.example api\.env` from the repository root. Set `DATABASE_URL` to the Supabase transaction-pooler URI for application queries. Set `DIRECT_URL` to the Supabase session-pooler URI for Prisma migrations when the machine cannot reach Supabase's IPv6-only direct endpoint. Copy both URIs from the Supabase dashboard's Connect panel; do not guess the pooler host or share the passwords. For the transaction pooler, use the port and query options supplied by Supabase for Prisma. The API port defaults to 4000 and the allowed web origin defaults to `http://localhost:3000`. Keep credentials in the ignored local file; never commit them.

The local health endpoint is `http://localhost:4000/health`. The initial product-catalogue migration has been applied to the configured Supabase database. Run `npx prisma migrate status` from `api/` to check migration state before future database work.

## Database connection troubleshooting

If Prisma reports `P1001`, check that the database hostname and port are reachable from the current network. In the Supabase dashboard, open **Connect** and copy the project-specific pooler URIs:

- Use **Transaction pooler** for `DATABASE_URL`, with the dashboard's Prisma-compatible query options.
- Use **Session pooler** for `DIRECT_URL` and migration commands from an IPv4-only network.

Set the values in the ignored `api/.env` locally. Do not paste them into chat or commit them. Rerun `npx prisma migrate status` from `api/` to confirm reachability and review pending migrations before applying them.
