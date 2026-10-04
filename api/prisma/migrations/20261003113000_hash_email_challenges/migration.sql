-- Replace plaintext one-time codes with hashes and index the lookup fields.
ALTER TABLE "EmailChallenge" RENAME COLUMN "code" TO "tokenHash";

DROP INDEX "EmailChallenge_email_idx";
CREATE INDEX "EmailChallenge_email_tokenHash_idx"
ON "EmailChallenge"("email", "tokenHash");
