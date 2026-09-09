import type {
  AiProviderId,
  AiStatus,
  AiStreamEvent,
  ChatMessage,
  Conversation,
} from "../types";
import { apiFetch, apiStream } from "./client";

/** GET /ai/status — whether questions can be answered at all. */
export function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  return apiFetch<AiStatus>("/ai/status", { signal });
}

/** PUT /ai/preference — stores the provider/model choice against the account,
 * so it follows the user to another browser. Returns the resulting status. */
export function setAiPreference(
  provider: AiProviderId,
  model?: string,
): Promise<AiStatus> {
  return apiFetch<AiStatus>("/ai/preference", {
    method: "PUT",
    body: model ? { provider, model } : { provider },
  });
}

/** GET /pages/:id/conversations */
export function listConversations(
  pageId: string,
  signal?: AbortSignal,
): Promise<Conversation[]> {
  return apiFetch<Conversation[]>(`/pages/${pageId}/conversations`, { signal });
}

/** POST /pages/:id/conversations */
export function createConversation(
  pageId: string,
  title?: string,
): Promise<Conversation> {
  return apiFetch<Conversation>(`/pages/${pageId}/conversations`, {
    method: "POST",
    body: title === undefined ? {} : { title },
  });
}

/** GET /conversations/:id/messages — reopening a previous conversation. */
export function listMessages(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/conversations/${conversationId}/messages`, {
    signal,
  });
}

/**
 * POST /conversations/:id/messages — asks a question and yields the answer as
 * it is generated.
 */
export function sendMessage(
  conversationId: string,
  content: string,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  return apiStream<AiStreamEvent>(
    `/conversations/${conversationId}/messages`,
    { method: "POST", body: { content }, signal },
  );
}
