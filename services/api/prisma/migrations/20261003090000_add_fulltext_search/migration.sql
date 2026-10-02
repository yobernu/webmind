-- Full-text search over saved knowledge (FR-09).
--
-- Expression indexes rather than stored tsvector columns, so no column exists
-- that the Prisma schema would have to describe. SearchRepository must use
-- these exact expressions, or the planner cannot use the indexes.
--
-- Prisma cannot express these indexes in schema.prisma. If a future
-- `prisma migrate dev` proposes dropping them, remove those statements from
-- the generated migration.

CREATE INDEX "notes_fts_idx" ON "notes"
  USING GIN (to_tsvector('english', "content" || ' ' || coalesce("sourceText", '')));

CREATE INDEX "messages_fts_idx" ON "messages"
  USING GIN (to_tsvector('english', "content"));

CREATE INDEX "highlights_fts_idx" ON "highlights"
  USING GIN (to_tsvector('english', "selectedText"));
