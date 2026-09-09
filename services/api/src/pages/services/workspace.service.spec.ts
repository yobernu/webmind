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
  });
});
