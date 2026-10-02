import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PagesRepository } from '../repositories/pages.repository.js';
import { WorkspaceService } from './workspace.service.js';

const page = {
  id: 'page-1',
  url: 'https://example.com/article',
  canonicalUrl: 'https://example.com/article',
  domain: 'example.com',
  title: 'My Article',
  content: 'Body.',
  contentHash: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  const repository = {
    findOwned: vi.fn(async () => page),
    countRelated: vi.fn(async () => ({ conversations: 2, notes: 3, highlights: 4 })),
    workspaceCollections: vi.fn(async () => ({
      conversations: [
        {
          id: 'conv-1',
          pageId: 'page-1',
          title: 'Q',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-05T00:00:00Z'),
          _count: { messages: 6 },
        },
      ],
      notes: [
        {
          id: 'note-1',
          userId: 'user-1',
          pageId: 'page-1',
          content: 'n',
          sourceText: null,
          createdAt: new Date('2026-09-02T00:00:00Z'),
          updatedAt: new Date('2026-09-07T00:00:00Z'),
        },
      ],
      highlights: [
        {
          id: 'hl-1',
          userId: 'user-1',
          pageId: 'page-1',
          selectedText: 'h',
          selector: null,
          createdAt: new Date('2026-09-06T00:00:00Z'),
        },
      ],
    })),
    ...overrides,
  };

  return {
    repository,
    service: new WorkspaceService(repository as unknown as PagesRepository),
  };
}

describe('WorkspaceService', () => {
  it('returns the page with its related counts', async () => {
    const { service } = createService();

    const result = await service.forPage('user-1', 'page-1');

    expect(result.page.id).toBe('page-1');
    expect(result.counts).toEqual({ conversations: 2, notes: 3, highlights: 4 });
  });

  it('returns the collections and the latest activity across them', async () => {
    const { service, repository } = createService();

    const result = await service.forPage('user-1', 'page-1');

    expect(repository.workspaceCollections).toHaveBeenCalledWith('user-1', 'page-1');
    expect(result.conversations[0]).toMatchObject({ id: 'conv-1', messageCount: 6 });
    expect(result.notes[0]).not.toHaveProperty('userId');
    expect(result.highlights[0]).toMatchObject({ id: 'hl-1', selector: null });
    expect(result.lastActivityAt).toEqual(new Date('2026-09-07T00:00:00Z'));
  });

  it('reports no activity on an empty page', async () => {
    const { service } = createService({
      workspaceCollections: vi.fn(async () => ({
        conversations: [],
        notes: [],
        highlights: [],
      })),
    });

    const result = await service.forPage('user-1', 'page-1');

    expect(result.lastActivityAt).toBeNull();
  });

  it('never leaks the stored page body', async () => {
    const { service } = createService();

    const result = await service.forPage('user-1', 'page-1');

    expect(result.page).not.toHaveProperty('content');
    expect(result.page.hasContent).toBe(true);
  });

  it('404s a page the user does not own, without counting anything', async () => {
    const { service, repository } = createService({
      findOwned: vi.fn(async () => null),
    });

    await expect(service.forPage('user-2', 'page-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.countRelated).not.toHaveBeenCalled();
    expect(repository.workspaceCollections).not.toHaveBeenCalled();
  });
});
