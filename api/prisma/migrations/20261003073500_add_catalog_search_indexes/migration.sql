CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX "products_title_idx"
ON "products" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "products_brand_idx"
ON "products" USING GIN ("brand" gin_trgm_ops);

CREATE INDEX "products_createdAt_idx"
ON "products"("createdAt");
