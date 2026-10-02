import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '../providers/ai-provider.interface.js';
import { EmbeddingsRepository } from '../repositories/embeddings.repository.js';
import { CredentialsService } from './credentials.service.js';
import { EMBEDDING_TIMEOUT_MS } from '../constants/prompt.constants.js';
import { chunkText } from '../utils/chunk-text.js';
import { withTimeout } from '../utils/timeout.js';

export const PAGE_SOURCE_TYPE = 'page';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly embeddings: EmbeddingsRepository,
    private readonly credentials: CredentialsService,
  ) {}

  /**
   * Chunks and embeds a page body.
   *
   * Never throws: this runs as a side effect of storing page content, and a
   * failed embed must not fail the upload. Without embeddings the context
   * assembler falls back to truncation, so the page stays usable.
   */
  async indexPage(
    userId: string,
    pageId: string,
    content: string,
  ): Promise<number> {
    // Embeddings are Gemini-only, so this asks for a Gemini key specifically:
    // the user's own if they have one, otherwise the server's.
    const credential = await this.credentials.tryResolveCredential(
      userId,
      'gemini',
    );

    if (!credential) return 0;

    const chunks = chunkText(content);
    if (chunks.length === 0) return 0;

    try {
      const vectors = await this.provider.embed(
        chunks,
        'document',
        credential.apiKey,
        withTimeout(EMBEDDING_TIMEOUT_MS),
      );

      await this.embeddings.replaceForSource(
        userId,
        PAGE_SOURCE_TYPE,
        pageId,
        chunks.map((chunk, index) => ({
          chunkIndex: index,
          content: chunk,
          embedding: vectors[index],
        })),
      );

      return chunks.length;
    } catch (error) {
      this.logger.warn(
        `Failed to index page ${pageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
