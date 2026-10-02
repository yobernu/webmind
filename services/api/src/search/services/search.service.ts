import { Injectable } from '@nestjs/common';

import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_RESULT_TYPES,
  type SearchResultType,
} from '../dto/search-query.dto.js';
import {
  toSearchResult,
  type SearchResult,
} from '../dto/search-results.dto.js';
import { SearchRepository } from '../repositories/search.repository.js';

/**
 * FR-09: PostgreSQL full-text search over the user's notes, conversation
 * messages and highlights. Semantic search can join later through the same
 * endpoint without changing its contract.
 */
@Injectable()
export class SearchService {
  constructor(private readonly search: SearchRepository) {}

  async query(
    userId: string,
    query: string,
    options: { type?: SearchResultType; limit?: number } = {},
  ): Promise<SearchResult[]> {
    const trimmed = query.replace(/\s+/g, ' ').trim();
    if (!trimmed) return [];

    const types = options.type ? [options.type] : SEARCH_RESULT_TYPES;
    const rows = await this.search.search(
      userId,
      trimmed,
      types,
      options.limit ?? DEFAULT_SEARCH_LIMIT,
    );

    return rows.map(toSearchResult);
  }
}
