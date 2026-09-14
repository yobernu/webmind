import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONTEXT_CHARS } from '../constants/prompt.constants.js';
import type { EmbeddingProvider } from '../providers/ai-provider.interface.js';
import type { EmbeddingsRepository } from '../repositories/embeddings.repository.js';
import type { CredentialsService } from './credentials.service.js';
import { ContextAssemblerService } from './context-assembler.service.js';

/** Longer than the budget, so the assembler must select rather than pass through. */
const longContent = 'x'.repeat(MAX_CONTEXT_CHARS + 5_000);

function createDeps(options: { configured?: boolean; hits?: unknown[]; indexed?: number } = {}) {
  const provider = {
    hasServerKey: options.configured ?? true,
    model: 'test-model',
    embeddingDimensions: 768,
    streamAnswer: vi.fn(),
    embed: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  };

  // 'configured' now means "a Gemini key is resolvable for this user", which
  // is the credentials service's job rather than the provider's.
  const credentials = {
    tryResolveCredential: vi.fn(async () =>
      (options.configured ?? true)
        ? { apiKey: 'test-key', source: 'server' as const }
        : null,
    ),
  };

  const embeddings = {
    countForSource: vi.fn(async () => options.indexed ?? 3),
    findSimilar: vi.fn(async () => options.hits ?? []),
    findChunk: vi.fn(async (): Promise<string | null> => null),
    replaceForSource: vi.fn(),
  };

  return {
    provider,
    embeddings,
    credentials,
    service: new ContextAssemblerService(
      provider as unknown as EmbeddingProvider,
      embeddings as unknown as EmbeddingsRepository,
      credentials as unknown as CredentialsService,
    ),
  };
}

const input = {
  userId: 'user-1',
  pageId: 'page-1',
  question: 'What does it say about pricing?',
  content: longContent,
};

describe('ContextAssemblerService', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it('passes a small page through whole and does not embed anything', async () => {
    const result = await deps.service.assemble({
      ...input,
      content: 'Short page body.',
    });

    expect(result).toEqual({
      content: 'Short page body.',
      partial: false,
      strategy: 'whole',
    });
    expect(deps.provider.embed).not.toHaveBeenCalled();
  });

  it('reports no content when the page has none', async () => {
    const result = await deps.service.assemble({ ...input, content: null });

    expect(result.strategy).toBe('none');
    expect(result.content).toBeNull();
  });

  it('treats whitespace-only content as none', async () => {
    const result = await deps.service.assemble({ ...input, content: '   \n ' });

    expect(result.strategy).toBe('none');
  });

  describe('retrieval on a large page', () => {
    it('embeds the question as a query, not a document', async () => {
      const { service, provider } = createDeps({
        hits: [{ chunkIndex: 0, content: 'chunk zero', distance: 0.1 }],
      });

      await service.assemble(input);

      expect(provider.embed).toHaveBeenCalledWith(
        [input.question],
        'query',
        'test-key',
      );
    });

    it('assembles hits in document order, not relevance order', async () => {
      const { service } = createDeps({
        hits: [
          { chunkIndex: 4, content: 'FOURTH', distance: 0.1 },
          { chunkIndex: 0, content: 'ZEROTH', distance: 0.3 },
          { chunkIndex: 2, content: 'SECOND', distance: 0.2 },
        ],
      });

      const result = await service.assemble(input);

      expect(result.strategy).toBe('retrieved');
      expect(result.partial).toBe(true);
      expect(result.content?.indexOf('ZEROTH')).toBeLessThan(
        result.content?.indexOf('SECOND') ?? -1,
      );
      expect(result.content?.indexOf('SECOND')).toBeLessThan(
        result.content?.indexOf('FOURTH') ?? -1,
      );
    });

    it('marks gaps between non-adjacent chunks', async () => {
      const { service } = createDeps({
        hits: [
          { chunkIndex: 0, content: 'ZEROTH', distance: 0.1 },
          { chunkIndex: 7, content: 'SEVENTH', distance: 0.2 },
        ],
      });

      const result = await service.assemble(input);

      expect(result.content).toContain('[…]');
    });

    it('pins the opening chunk in even when it did not rank', async () => {
      // Chunk 0 usually carries the headline and thesis.
      const { service, embeddings } = createDeps({
        hits: [{ chunkIndex: 5, content: 'FIFTH', distance: 0.1 }],
      });
      embeddings.findChunk = vi.fn(async () => 'ZEROTH');

      const result = await service.assemble(input);

      expect(embeddings.findChunk).toHaveBeenCalledWith('page', 'page-1', 0);
      expect(result.content).toContain('ZEROTH');
      expect(result.content?.indexOf('ZEROTH')).toBeLessThan(
        result.content?.indexOf('FIFTH') ?? -1,
      );
    });

    it('does not fetch the opening chunk twice when it already ranked', async () => {
      const { service, embeddings } = createDeps({
        hits: [{ chunkIndex: 0, content: 'ZEROTH', distance: 0.1 }],
      });

      await service.assemble(input);

      expect(embeddings.findChunk).not.toHaveBeenCalled();
    });

    it('stays within the character budget', async () => {
      const { service } = createDeps({
        hits: Array.from({ length: 6 }, (_, index) => ({
          chunkIndex: index,
          content: 'y'.repeat(9_000),
          distance: 0.1 * index,
        })),
      });

      const result = await service.assemble(input);

      expect(result.content!.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    });

    it('scopes the search to the requesting user', async () => {
      const { service, embeddings } = createDeps({
        hits: [{ chunkIndex: 0, content: 'ZEROTH', distance: 0.1 }],
      });

      await service.assemble(input);

      expect(embeddings.findSimilar).toHaveBeenCalledWith(
        'user-1',
        'page',
        'page-1',
        expect.anything(),
        expect.any(Number),
      );
    });
  });

  describe('falls back to truncation', () => {
    it('when nothing is indexed yet', async () => {
      const { service, provider } = createDeps({ indexed: 0 });

      const result = await service.assemble(input);

      expect(result.strategy).toBe('truncated');
      expect(result.partial).toBe(true);
      expect(result.content).toHaveLength(MAX_CONTEXT_CHARS);
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it('when there is no API key', async () => {
      const { service } = createDeps({ configured: false });

      expect((await service.assemble(input)).strategy).toBe('truncated');
    });

    it('when similarity search returns nothing', async () => {
      const { service } = createDeps({ hits: [] });

      expect((await service.assemble(input)).strategy).toBe('truncated');
    });

    it('when the embedding call throws, rather than failing the question', async () => {
      const { service, provider } = createDeps();
      provider.embed = vi.fn(async () => {
        throw new Error('quota exceeded');
      });

      const result = await service.assemble(input);

      expect(result.strategy).toBe('truncated');
      expect(result.content).not.toBeNull();
    });
  });
});
