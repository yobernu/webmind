import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmbeddingService } from '../../ai/services/embedding.service.js';
import type { PagesRepository } from '../repositories/pages.repository.js';
import { hashContent } from '../utils/content-hash.js';
import { PageContentService } from './page-content.service.js';
import { PageIdentityService } from './page-identity.service.js';
import { PagesService } from './pages.service.js';

interface StoredPage {
  id: string;
  userId: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  content: string | null;
  contentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory PagesRepository honouring the one constraint that matters here:
 * unique on (userId, canonicalUrl).
 */
function createRepositoryStub() {
  const rows = new Map<string, StoredPage>();
  let nextId = 1;

  const key = (userId: string, canonicalUrl: string) => `${userId}::${canonicalUrl}`;

  return {
    rows,

    upsertByCanonical: vi.fn(async (userId: string, identity: any) => {
      const existing = [...rows.values()].find(
        (row) => row.userId === userId && row.canonicalUrl === identity.canonicalUrl,
      );

      if (existing) {
        existing.url = identity.url;
        existing.title = identity.title ?? existing.title;
        return existing;
      }

      const row: StoredPage = {
        id: `page-${nextId++}`,
        userId,
        url: identity.url,
        canonicalUrl: identity.canonicalUrl,
        domain: identity.domain,
        title: identity.title,
        content: null,
        contentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(key(userId, identity.canonicalUrl), row);
      return row;
    }),

    findOwned: vi.fn(async (userId: string, pageId: string) =>
      [...rows.values()].find((row) => row.id === pageId && row.userId === userId) ?? null,
    ),

    updateContent: vi.fn(async (pageId: string, content: string, contentHash: string) => {
      const row = [...rows.values()].find((candidate) => candidate.id === pageId)!;
      row.content = content;
      row.contentHash = contentHash;
      return row;
    }),

    countRelated: vi.fn(async () => ({ conversations: 0, notes: 0, highlights: 0 })),
  };
}

function createService(repository: ReturnType<typeof createRepositoryStub>) {
  // Indexing is a side effect of storing content and is covered by its own
  // specs; here it is a no-op so page behaviour is tested in isolation.
  const embeddings = { indexPage: vi.fn(async () => 0) };

  return new PagesService(
    repository as unknown as PagesRepository,
    new PageIdentityService(),
    new PageContentService(),
    embeddings as unknown as EmbeddingService,
  );
}

describe('PagesService.resolve', () => {
  let repository: ReturnType<typeof createRepositoryStub>;
  let service: PagesService;

  beforeEach(() => {
    repository = createRepositoryStub();
    service = createService(repository);
  });

  it('creates a page and asks for its content on first sight', async () => {
    const result = await service.resolve('user-1', {
      url: 'https://example.com/article',
      title: 'My Article',
      contentHash: 'abc',
    });

    expect(result.page.canonicalUrl).toBe('https://example.com/article');
    expect(result.page.domain).toBe('example.com');
    expect(result.page.hasContent).toBe(false);
    expect(result.needsContent).toBe(true);
  });

  it('collapses tracking parameters, fragments and www onto one page', async () => {
    const first = await service.resolve('user-1', {
      url: 'https://www.example.com/article?utm_source=twitter#intro',
    });
    const second = await service.resolve('user-1', {
      url: 'https://example.com/article/',
    });

    expect(second.page.id).toBe(first.page.id);
    expect(repository.rows.size).toBe(1);
  });

  it('keeps different users on separate pages for the same url', async () => {
    const mine = await service.resolve('user-1', { url: 'https://example.com/a' });
    const theirs = await service.resolve('user-2', { url: 'https://example.com/a' });

    expect(theirs.page.id).not.toBe(mine.page.id);
    expect(repository.rows.size).toBe(2);
  });

  it('stops asking for content once the stored hash matches', async () => {
    const text = 'The article body.';
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });
    await service.storeContent('user-1', page.id, { content: text });

    const again = await service.resolve('user-1', {
      url: 'https://example.com/a',
      contentHash: hashContent(text),
    });

    expect(again.needsContent).toBe(false);
    expect(again.page.hasContent).toBe(true);
  });

  it('asks again when the page content has changed', async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });
    await service.storeContent('user-1', page.id, { content: 'Original text.' });

    const again = await service.resolve('user-1', {
      url: 'https://example.com/a',
      contentHash: hashContent('Edited text.'),
    });

    expect(again.needsContent).toBe(true);
  });

  it('refreshes the observed url but keeps a title a later visit could not read', async () => {
    await service.resolve('user-1', {
      url: 'https://example.com/a?utm_source=one',
      title: 'Real Title',
    });
    const second = await service.resolve('user-1', {
      url: 'https://example.com/a?utm_source=two',
    });

    expect(second.page.url).toBe('https://example.com/a?utm_source=two');
    expect(second.page.title).toBe('Real Title');
  });
});

describe('PagesService.storeContent', () => {
  let repository: ReturnType<typeof createRepositoryStub>;
  let service: PagesService;

  beforeEach(() => {
    repository = createRepositoryStub();
    service = createService(repository);
  });

  it('stores normalised text and the hash computed from it', async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });

    const updated = await service.storeContent('user-1', page.id, {
      content: '  Body   with\n\n  loose   whitespace.  ',
    });

    expect(updated.hasContent).toBe(true);
    expect(updated.contentHash).toBe(hashContent('Body with loose whitespace.'));
    expect(repository.rows.get('user-1::https://example.com/a')?.content).toBe(
      'Body with loose whitespace.',
    );
  });

  it('rejects a hash that does not match the body', async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });

    await expect(
      service.storeContent('user-1', page.id, {
        content: 'Real body.',
        contentHash: hashContent('Something else.'),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects empty content', async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });

    await expect(
      service.storeContent('user-1', page.id, { content: '   \n  ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses to write into another user's page", async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });

    await expect(
      service.storeContent('user-2', page.id, { content: 'Injected.' }),
    ).rejects.toThrow(NotFoundException);

    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('hides pages belonging to another user', async () => {
    const { page } = await service.resolve('user-1', { url: 'https://example.com/a' });

    await expect(service.findOwned('user-2', page.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
