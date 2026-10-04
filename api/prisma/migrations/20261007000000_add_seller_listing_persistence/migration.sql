CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "products"
ADD COLUMN "sellerId" TEXT,
ADD COLUMN "listingStatus" "ListingStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");
CREATE INDEX "products_sellerId_listingStatus_createdAt_idx"
ON "products"("sellerId", "listingStatus", "createdAt");

ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_sellerId_fkey"
FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "products_stock_check" CHECK ("stock" >= 0);
