import type { SearchResult, SearchResultType } from "../types";
import { apiFetch } from "./client";

/** GET /search — the user's notes, conversations and highlights across pages. */
export function searchKnowledge(
  query: string,
  options: { type?: SearchResultType; limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options.type) params.set("type", options.type);
  if (options.limit) params.set("limit", String(options.limit));

  return apiFetch<SearchResult[]>(`/search?${params.toString()}`, {
    signal: options.signal,
  });
}
