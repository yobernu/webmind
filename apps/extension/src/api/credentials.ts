import type { AiProviderId, ProviderCredentialSummary } from "../types";
import { apiFetch } from "./client";

/** GET /ai/credentials — masked; the API never returns a key. */
export function listCredentials(
  signal?: AbortSignal,
): Promise<ProviderCredentialSummary[]> {
  return apiFetch<ProviderCredentialSummary[]>("/ai/credentials", { signal });
}

/**
 * PUT /ai/credentials/:provider — the server validates the key against the
 * provider before storing it, so a typo fails here rather than at the next
 * question.
 */
export function saveCredential(
  provider: AiProviderId,
  apiKey: string,
): Promise<ProviderCredentialSummary> {
  return apiFetch<ProviderCredentialSummary>(`/ai/credentials/${provider}`, {
    method: "PUT",
    body: { apiKey },
  });
}

/** DELETE /ai/credentials/:provider — answers fall back to the server's key. */
export function deleteCredential(provider: AiProviderId): Promise<void> {
  return apiFetch<void>(`/ai/credentials/${provider}`, { method: "DELETE" });
}
