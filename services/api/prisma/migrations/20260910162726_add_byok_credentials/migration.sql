-- Entitlement half of the BYOK chain. Defaults true so existing users can opt
-- in simply by saving a key; no backfill needed.
ALTER TABLE "users" ADD COLUMN "byokEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Per-user provider keys. Only ciphertext is stored; see secret-box.ts for the
-- AAD binding that makes a row useless outside its owning user.
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "hint" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_credentials_userId_provider_key"
  ON "provider_credentials"("userId", "provider");

CREATE INDEX "provider_credentials_userId_idx"
  ON "provider_credentials"("userId");

ALTER TABLE "provider_credentials"
  ADD CONSTRAINT "provider_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
