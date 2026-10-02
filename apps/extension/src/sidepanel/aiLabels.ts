import type { AiProviderId, AiStatus } from "../types";

/** Human-readable provider name, falling back to the raw id. */
export function providerLabel(status: AiStatus, id: AiProviderId): string {
  return status.providers.find((provider) => provider.id === id)?.label ?? id;
}
