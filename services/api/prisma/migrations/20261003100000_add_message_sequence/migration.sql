-- Explicit message ordering, and a flag for answers that were cut short.

ALTER TABLE "messages" ADD COLUMN "sequence" INTEGER;
ALTER TABLE "messages" ADD COLUMN "incomplete" BOOLEAN NOT NULL DEFAULT false;

-- Number existing rows in the order they were shown until now.
UPDATE "messages" AS m
SET "sequence" = numbered.position
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", "id") AS position
  FROM "messages"
) AS numbered
WHERE numbered."id" = m."id";

ALTER TABLE "messages" ALTER COLUMN "sequence" SET NOT NULL;

-- DropIndex
DROP INDEX "messages_conversationId_createdAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_sequence_key" ON "messages"("conversationId", "sequence");
