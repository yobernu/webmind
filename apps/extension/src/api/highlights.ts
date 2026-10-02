import type { Highlight, HighlightSelector } from "../types";
import { apiFetch } from "./client";

/** GET /pages/:id/highlights */
export function listHighlights(
  pageId: string,
  signal?: AbortSignal,
): Promise<Highlight[]> {
  return apiFetch<Highlight[]>(`/pages/${pageId}/highlights`, { signal });
}

/** POST /pages/:id/highlights */
export function createHighlight(
  pageId: string,
  selectedText: string,
  selector?: HighlightSelector,
): Promise<Highlight> {
  return apiFetch<Highlight>(`/pages/${pageId}/highlights`, {
    method: "POST",
    body: selector ? { selectedText, selector } : { selectedText },
  });
}

/** DELETE /highlights/:id */
export function deleteHighlight(highlightId: string): Promise<void> {
  return apiFetch<void>(`/highlights/${highlightId}`, { method: "DELETE" });
}
