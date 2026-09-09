-- The vector type comes from pgvector, which Prisma cannot manage itself
-- without the postgresqlExtensions preview feature. Creating it here keeps the
-- migration self-contained; the container image (pgvector/pgvector:pg16) ships
-- the extension.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "embeddings_userId_idx" ON "embeddings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_sourceType_sourceId_chunkIndex_key" ON "embeddings"("sourceType", "sourceId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cosine-distance index for similarity search. HNSW gives good recall without
-- the training step ivfflat needs, which matters because chunks are inserted
-- continuously rather than loaded in bulk.
CREATE INDEX "embeddings_embedding_cosine_idx"
  ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
