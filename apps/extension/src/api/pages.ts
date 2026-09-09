import type { PageRecord, PageWorkspace } from "../types";
import { apiFetch } from "./client";

export interface ResolvePagePayload {
  url: string;
  title?: string;
  canonicalHint?: string;
  /** Lets the API answer "I already have this text" without a transfer. */
  contentHash?: string;
}

export interface ResolvePageResult {
  page: PageRecord;
  needsContent: boolean;
}

/** POST /pages/resolve — idempotent per (user, canonical URL). */
export function resolvePage(
  payload: ResolvePagePayload,
  signal?: AbortSignal,
): Promise<ResolvePageResult> {
  return apiFetch<ResolvePageResult>("/pages/resolve", {
    method: "POST",
    body: payload,
    signal,
  });
}

/** PUT /pages/:id/content — only called when resolve reported needsContent. */
export function uploadPageContent(
  pageId: string,
  content: string,
  contentHash?: string,
  signal?: AbortSignal,
): Promise<PageRecord> {
  return apiFetch<PageRecord>(`/pages/${pageId}/content`, {
    method: "PUT",
    body: { content, contentHash },
    signal,
  });
}

/** GET /pages/:id/workspace — the page plus what is attached to it. */
export function fetchPageWorkspace(
  pageId: string,
  signal?: AbortSignal,
): Promise<PageWorkspace> {
  return apiFetch<PageWorkspace>(`/pages/${pageId}/workspace`, { signal });
}
