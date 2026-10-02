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
- `prisma/schema.prisma`: PostgreSQL datasource and Prisma client generator only.

## Commands

From the repository root, run `npm run dev --workspace api`, `npm run lint --workspace api`, `npm test --workspace api`, or `npm run build --workspace api`.

The local health endpoint is `http://localhost:4000/health`. Database migrations are intentionally not included in this setup.