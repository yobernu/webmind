import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PagesService } from '../../pages/services/pages.service.js';
import type { HighlightsRepository } from '../repositories/highlights.repository.js';
import { HighlightsService } from './highlights.service.js';

const selector = {
  quote: { exact: 'the passage', prefix: 'before ', suffix: ' after' },
  position: { start: 10, end: 21 },
};

const row = {
  id: 'hl-1',
  userId: 'user-1',
  pageId: 'page-1',
  selectedText: 'the passage',
  selector: selector as unknown,
  createdAt: new Date('2026-09-20T10:00:00Z'),
};

function createDeps(
  options: { pageOwned?: boolean; highlightOwned?: boolean } = {},
) {
  const highlights = {
    create: vi.fn(async () => row),
    findOwned: vi.fn(async () =>
      options.highlightOwned === false ? null : row,
    ),
    listForPage: vi.fn(async () => [
      row,
      { ...row, id: 'hl-2', selector: null },
    ]),
    delete: vi.fn(async () => undefined),
  };

  const pages = {
    findOwned: vi.fn(async () => {
      if (options.pageOwned === false)
        throw new NotFoundException('Page not found');
      return { id: 'page-1' };
    }),
  };

  return {
    highlights,
    pages,
    service: new HighlightsService(
      highlights as unknown as HighlightsRepository,
      pages as unknown as PagesService,
    ),
  };
}

describe('HighlightsService', () => {
  it('saves a highlight with its selector on an owned page', async () => {
    const { service, highlights } = createDeps();

    const result = await service.create(
      'user-1',
      'page-1',
      'the passage',
      selector,
    );

    expect(highlights.create).toHaveBeenCalledWith(
      'user-1',
      'page-1',
      'the passage',
      selector,
    );
    expect(result.selector).toEqual(selector);
    expect(result).not.toHaveProperty('userId');
  });

  it('stores a missing selector as null', async () => {
    const { service, highlights } = createDeps();

    await service.create('user-1', 'page-1', 'the passage');

    expect(highlights.create).toHaveBeenCalledWith(
      'user-1',
      'page-1',
      'the passage',
      null,
    );
  });

  it('refuses to save on a page the user does not own', async () => {
    const { service, highlights } = createDeps({ pageOwned: false });

    await expect(service.create('user-2', 'page-1', 'x')).rejects.toThrow(
      NotFoundException,
    );
    expect(highlights.create).not.toHaveBeenCalled();
  });

  it('lists a page’s highlights, mapping a null selector', async () => {
    const { service } = createDeps();

    const result = await service.listForPage('user-1', 'page-1');

    expect(result.map((h) => h.selector)).toEqual([selector, null]);
  });

  it('refuses to list highlights of a page the user does not own', async () => {
    const { service, highlights } = createDeps({ pageOwned: false });

    await expect(service.listForPage('user-2', 'page-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(highlights.listForPage).not.toHaveBeenCalled();
  });

  it('deletes an owned highlight and 404s on someone else’s', async () => {
    const owned = createDeps();
    await owned.service.remove('user-1', 'hl-1');
    expect(owned.highlights.delete).toHaveBeenCalledWith('hl-1');

    const foreign = createDeps({ highlightOwned: false });
    await expect(foreign.service.remove('user-2', 'hl-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(foreign.highlights.delete).not.toHaveBeenCalled();
  });
});
