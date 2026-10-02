import { describe, expect, it, vi } from 'vitest';

import type { SearchRow } from '../dto/search-results.dto.js';
import type { SearchRepository } from '../repositories/search.repository.js';
import { SearchService } from './search.service.js';

const row: SearchRow = {
  type: 'message',
  id: 'msg-1',
  snippet: 'about vectors',
  createdAt: new Date('2026-09-20T10:00:00Z'),
  conversationId: 'conv-1',
  pageId: 'page-1',
  url: 'https://example.com/a',
  title: 'Article',
  domain: 'example.com',
};

function createService(rows: SearchRow[] = [row]) {
  const repository = { search: vi.fn(async () => rows) };

  return {
    repository,
    service: new SearchService(repository as unknown as SearchRepository),
  };
}

describe('SearchService', () => {
  it('searches every kind of item by default, with the default limit', async () => {
    const { service, repository } = createService();

    await service.query('user-1', 'vectors');

    expect(repository.search).toHaveBeenCalledWith(
      'user-1',
      'vectors',
      ['note', 'message', 'highlight'],
      20,
    );
  });

  it('narrows to one type and honours the limit', async () => {
    const { service, repository } = createService();

    await service.query('user-1', 'vectors', { type: 'note', limit: 5 });

    expect(repository.search).toHaveBeenCalledWith(
      'user-1',
      'vectors',
      ['note'],
      5,
    );
  });

  it('collapses whitespace and skips the query when nothing is left', async () => {
    const { service, repository } = createService();

    await service.query('user-1', '  vector \n  search ');
    expect(repository.search).toHaveBeenCalledWith(
      'user-1',
      'vector search',
      expect.any(Array),
      20,
    );

    repository.search.mockClear();
    expect(await service.query('user-1', '   ')).toEqual([]);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it('nests the source page in each result', async () => {
    const { service } = createService();

    const [result] = await service.query('user-1', 'vectors');

    expect(result).toEqual({
      type: 'message',
      id: 'msg-1',
      snippet: 'about vectors',
      createdAt: row.createdAt,
      conversationId: 'conv-1',
      page: {
        id: 'page-1',
        url: 'https://example.com/a',
        title: 'Article',
        domain: 'example.com',
      },
    });
  });
});
