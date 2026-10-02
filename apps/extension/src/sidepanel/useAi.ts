import { useCallback, useEffect, useState } from "react";
import { fetchAiStatus, setAiPreference } from "../api/conversations";
import { listCredentials } from "../api/credentials";
import type { AiProviderId, AiStatus, ProviderCredentialSummary } from "../types";

export interface AiState {
  /** Null until the first status arrives (or when it cannot be fetched). */
  status: AiStatus | null;
  /** This user's own stored provider keys, masked. */
  credentials: ProviderCredentialSummary[];
  /** Refetches status and credentials after a key is added or removed. */
  refresh: () => Promise<void>;
  /** Persists which provider/model answers this user's questions. */
  chooseProvider: (provider: AiProviderId, model?: string) => Promise<void>;
}

/**
 * The account's AI configuration. Lives in App rather than in the chat,
 * because Settings shows and changes it too, and the chat remounts whenever
 * the page changes.
 */
export function useAi(enabled: boolean): AiState {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [credentials, setCredentials] = useState<ProviderCredentialSummary[]>([]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [next, keys] = await Promise.all([
      fetchAiStatus(signal).catch(() => null),
      listCredentials(signal).catch(() => [] as ProviderCredentialSummary[]),
    ]);

    if (signal?.aborted) return;
    setStatus(next);
    setCredentials(keys);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    // Fetching from the API is the external-system case the lint rule exempts;
    // the state is set after the await, not during the render pass.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(controller.signal);

    return () => controller.abort();
  }, [enabled, load]);

  const refresh = useCallback(() => load(), [load]);

  const chooseProvider = useCallback(async (provider: AiProviderId, model?: string) => {
    setStatus(await setAiPreference(provider, model));
  }, []);

  return { status, credentials, refresh, chooseProvider };
}
