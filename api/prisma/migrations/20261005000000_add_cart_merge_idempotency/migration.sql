CREATE TABLE "CartMerge" (
    "idempotencyKey" UUID NOT NULL,
    "cartId" TEXT NOT NULL,
    "rejectedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartMerge_pkey" PRIMARY KEY ("idempotencyKey")
);

CREATE INDEX "CartMerge_cartId_createdAt_idx" ON "CartMerge"("cartId", "createdAt");

ALTER TABLE "CartMerge"
ADD CONSTRAINT "CartMerge_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
