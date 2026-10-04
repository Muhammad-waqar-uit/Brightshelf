ALTER TABLE "Order"
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "stripeSessionId" TEXT,
ADD COLUMN "stockReserved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reservationReleasedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
ADD COLUMN "sellerId" TEXT,
ADD COLUMN "sellerName" TEXT;

CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
CREATE INDEX "OrderItem_sellerId_orderId_idx" ON "OrderItem"("sellerId", "orderId");

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");
