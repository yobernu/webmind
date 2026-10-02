import type { SearchResultType } from './search-query.dto.js';

/**
 * Wraps each matched term in the snippet. Private-use characters, so nothing
 * a user could have typed is ever mistaken for a marker, and the client can
 * render them as <mark> without parsing HTML.
 */
export const SNIPPET_MARK_START = '';
export const SNIPPET_MARK_END = '';

/** One hit, identifying its source page (FR-09). */
export interface SearchResult {
  type: SearchResultType;
  id: string;
  snippet: string;
  createdAt: Date;
  /** Set for message hits, so the conversation can be reopened. */
  conversationId: string | null;
  page: {
    id: string;
    url: string;
    title: string | null;
    domain: string;
  };
}

/** A row as the search query returns it. */
export interface SearchRow {
  type: SearchResultType;
  id: string;
  snippet: string;
  createdAt: Date;
  conversationId: string | null;
  pageId: string;
  url: string;
  title: string | null;
  domain: string;
}

export function toSearchResult(row: SearchRow): SearchResult {
  return {
    type: row.type,
    id: row.id,
    snippet: row.snippet,
    createdAt: row.createdAt,
    conversationId: row.conversationId,
    page: {
      id: row.pageId,
      url: row.url,
      title: row.title,
      domain: row.domain,
    },
  };
}
