import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_CHUNKS,
} from '../constants/prompt.constants.js';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../providers/ai-provider.interface.js';
import { EmbeddingsRepository } from '../repositories/embeddings.repository.js';
import { PAGE_SOURCE_TYPE } from './embedding.service.js';

export interface AssembleInput {
  userId: string;
  pageId: string;
  question: string;
  /** Whole stored page body, used for the fallback path. */
  content: string | null;
}

export interface AssembledContext {
  /** Text to place in the untrusted block, or null when there is none. */
  content: string | null;
  /** True when this is a selection rather than the whole page. */
  partial: boolean;
  /** How the text was chosen, for logging and tests. */
  strategy: 'whole' | 'retrieved' | 'truncated' | 'none';
}

/** Chunk 0 usually carries the headline and thesis, so it is always included
 * even when similarity ranks it low. */
const ALWAYS_INCLUDE_FIRST_CHUNK = true;

@Injectable()
export class ContextAssemblerService {
  private readonly logger = new Logger(ContextAssemblerService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly embeddings: EmbeddingsRepository,
  ) {}

  /**
   * Chooses which part of a page to show the model (SRS §8: "limit context to
   * relevant content when pages are large").
   *
   * Small pages go through whole. Large ones are answered from the chunks
   * closest to the question, which is what lets a question about the middle of
   * a long document work at all. If retrieval is unavailable — no key, nothing
   * indexed yet, a failing query — it degrades to truncation rather than
   * refusing to answer.
   */
  async assemble(input: AssembleInput): Promise<AssembledContext> {
    const { userId, pageId, question, content } = input;

    if (!content || content.trim().length === 0) {
      return { content: null, partial: false, strategy: 'none' };
    }

    if (content.length <= MAX_CONTEXT_CHARS) {
      return { content, partial: false, strategy: 'whole' };
    }

    const retrieved = await this.retrieve(userId, pageId, question);

    if (retrieved) {
      return { content: retrieved, partial: true, strategy: 'retrieved' };
    }

    return {
      content: content.slice(0, MAX_CONTEXT_CHARS),
      partial: true,
      strategy: 'truncated',
    };
  }

  /** Similarity search, or null when it cannot be used. */
  private async retrieve(
    userId: string,
    pageId: string,
    question: string,
  ): Promise<string | null> {
    if (!this.provider.isConfigured) return null;

    try {
      const indexed = await this.embeddings.countForSource(
        PAGE_SOURCE_TYPE,
        pageId,
      );
      if (indexed === 0) return null;

      const [queryEmbedding] = await this.provider.embed([question], 'query');
      if (!queryEmbedding) return null;

      const hits = await this.embeddings.findSimilar(
        userId,
        PAGE_SOURCE_TYPE,
        pageId,
        queryEmbedding,
        MAX_CONTEXT_CHUNKS,
      );

      if (hits.length === 0) return null;

      const selected = new Map(hits.map((hit) => [hit.chunkIndex, hit.content]));

      if (ALWAYS_INCLUDE_FIRST_CHUNK && !selected.has(0)) {
        const first = await this.embeddings.findChunk(
          PAGE_SOURCE_TYPE,
          pageId,
          0,
        );

        if (first) selected.set(0, first);
      }

      // Reassemble in document order: the model reads better prose than a
      // relevance-sorted jumble, and adjacent chunks rejoin naturally.
      const ordered = [...selected.entries()].sort(([a], [b]) => a - b);

      let assembled = '';
      for (const [, chunk] of ordered) {
        const separator = assembled.length === 0 ? '' : '\n\n[…]\n\n';
        if (assembled.length + separator.length + chunk.length > MAX_CONTEXT_CHARS) {
          break;
        }
        assembled += separator + chunk;
      }

      return assembled.length > 0 ? assembled : null;
    } catch (error) {
      this.logger.warn(
        `Retrieval failed for page ${pageId}, falling back to truncation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
