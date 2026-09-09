import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface ChunkToStore {
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface SimilarChunk {
  chunkIndex: number;
  content: string;
  /** Cosine distance: 0 is identical, 2 is opposite. */
  distance: number;
}

/**
 * The only place the `vector` column is touched. Prisma types it as
 * `Unsupported`, so reads and writes go through raw SQL; pgvector accepts the
 * literal form `'[1,2,3]'::vector`.
 */
@Injectable()
export class EmbeddingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** pgvector literal. Values come from the provider, but are re-checked as
   * finite numbers because they are interpolated into SQL as a literal. */
  private toVector(embedding: number[]): string {
    for (const value of embedding) {
      if (!Number.isFinite(value)) {
        throw new Error('Embedding contains a non-finite value');
      }
    }

    return `[${embedding.join(',')}]`;
  }

  /** Replaces the stored chunks for a source in one transaction, so a re-embed
   * never leaves a mix of old and new chunks visible to a query. */
  async replaceForSource(
    userId: string,
    sourceType: string,
    sourceId: string,
    chunks: ChunkToStore[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "embeddings"
        WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}
      `;

      for (const chunk of chunks) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "embeddings"
             ("id", "userId", "sourceType", "sourceId", "chunkIndex", "content", "embedding", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::vector, now())`,
          userId,
          sourceType,
          sourceId,
          chunk.chunkIndex,
          chunk.content,
          this.toVector(chunk.embedding),
        );
      }
    });
  }

  /** Nearest chunks for a source, closest first. Scoped by user as well as
   * source so a leaked id cannot read another account's chunks. */
  async findSimilar(
    userId: string,
    sourceType: string,
    sourceId: string,
    queryEmbedding: number[],
    limit: number,
  ): Promise<SimilarChunk[]> {
    return this.prisma.$queryRawUnsafe<SimilarChunk[]>(
      `SELECT "chunkIndex", "content", ("embedding" <=> $4::vector) AS "distance"
         FROM "embeddings"
        WHERE "userId" = $1 AND "sourceType" = $2 AND "sourceId" = $3
        ORDER BY "embedding" <=> $4::vector
        LIMIT $5`,
      userId,
      sourceType,
      sourceId,
      this.toVector(queryEmbedding),
      limit,
    );
  }

  /** One specific chunk, used to pin the opening chunk into the context. */
  async findChunk(
    sourceType: string,
    sourceId: string,
    chunkIndex: number,
  ): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ content: string }[]>`
      SELECT "content"
        FROM "embeddings"
       WHERE "sourceType" = ${sourceType}
         AND "sourceId" = ${sourceId}
         AND "chunkIndex" = ${chunkIndex}
       LIMIT 1
    `;

    return rows[0]?.content ?? null;
  }

  async countForSource(sourceType: string, sourceId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS "count"
        FROM "embeddings"
       WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}
    `;

    return Number(rows[0]?.count ?? 0);
  }
}
