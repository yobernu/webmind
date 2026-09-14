import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  fetchAiStatus,
  listConversations,
  listMessages,
  sendMessage,
  setAiPreference,
} from "../api/conversations";
import { listCredentials } from "../api/credentials";
import { ApiError } from "../api/client";
import type {
  AiProviderId,
  AiStage,
  AiStatus,
  ChatMessage,
  Conversation,
  ProviderCredentialSummary,
} from "../types";

export interface ChatState {
  status: AiStatus | null;
  /** This user's own stored provider keys, masked. */
  credentials: ProviderCredentialSummary[];
  /** Refetches status and credentials after a key is added or removed. */
  refreshAi: () => Promise<void>;
  conversations: Conversation[];
  conversationId: string | null;
  messages: ChatMessage[];
  /** Answer text arriving right now; empty when nothing is in flight. */
  streaming: string;
  pending: boolean;
  error: string | null;
  /** The question that failed, so it can be resent without retyping. */
  failedQuestion: string | null;
  /** Phase the server last reported; null once text starts arriving. */
  stage: AiStage | null;
  /** When the current phase began, for the elapsed hint on a long wait. */
  stageSince: number | null;
  ask: (question: string) => Promise<void>;
  /** Interrupts the answer in progress, keeping whatever was generated. */
  stop: () => void;
  /** Persists which provider/model answers this user's questions. */
  chooseProvider: (provider: AiProviderId, model?: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  openConversation: (conversationId: string) => Promise<void>;
  dismissError: () => void;
}

/** Optimistic rows get a temporary id; the server's arrives with `done`. */
const LOCAL_ID_PREFIX = "local-";

/**
 * Chat for one page. Resets whenever the resolved page changes, so a thread is
 * never shown against the wrong page.
 */
export function useChat(pageId: string | null): ChatState {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<ProviderCredentialSummary[]>([]);
  const [stage, setStage] = useState<AiStage | null>(null);
  const [stageSince, setStageSince] = useState<number | null>(null);

  // Lets an in-flight answer be abandoned when the page changes or the panel
  // unmounts, which also stops the server generating.
  const inFlight = useRef<AbortController | null>(null);

  // Set by stop(); an unmount aborts the same controller but must not touch
  // state afterwards.
  const stopped = useRef(false);

  const loadAi = useCallback(async (signal?: AbortSignal) => {
    const [next, keys] = await Promise.all([
      fetchAiStatus(signal).catch(() => null),
      listCredentials(signal).catch(() => [] as ProviderCredentialSummary[]),
    ]);

    if (signal?.aborted) return;
    setStatus(next);
    setCredentials(keys);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    // Fetching from the API is the external-system case the lint rule exempts;
    // the state is set after the await, not during the render pass.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadAi(controller.signal);

    return () => controller.abort();
  }, [loadAi]);

  const refreshAi = useCallback(() => loadAi(), [loadAi]);

  // Loads what was already asked on this page. No state reset is needed here:
  // App keys this component by page id, so a different page arrives as a fresh
  // mount.
  useEffect(() => {
    if (!pageId) return;

    const controller = new AbortController();

    const restore = async () => {
      try {
        const existing = await listConversations(pageId, controller.signal);
        if (controller.signal.aborted) return;

        setConversations(existing);

        // Reopen the most recent thread, so returning to a page shows what was
        // already asked there (PRD §9.6).
        const latest = existing[0];
        if (!latest) return;

        setConversationId(latest.id);
        const history = await listMessages(latest.id, controller.signal);
        if (!controller.signal.aborted) setMessages(history);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.isBadCredentials) return;
        setError(
          cause instanceof ApiError ? cause.message : "Could not load this chat",
        );
      }
    };

    void restore();

    return () => controller.abort();
  }, [pageId]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || !pageId || pending) return;

      setPending(true);
      setError(null);
      setFailedQuestion(null);
      setStreaming("");
      setStage(null);
      setStageSince(null);

      const controller = new AbortController();
      inFlight.current = controller;
      stopped.current = false;

      // Show the question immediately; the server has already stored it by the
      // time the first delta arrives.
      const optimistic: ChatMessage = {
        id: `${LOCAL_ID_PREFIX}${Date.now()}`,
        conversationId: conversationId ?? "",
        role: "USER",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);

      // Set once the server has finished with this exchange, so the thread can
      // be reconciled against what was actually stored. Optimistic rows and
      // retries otherwise drift from storage — a retry would show the question
      // twice locally while the server holds its own record.
      let settled: string | null = null;

      // Declared outside the try so the catch can still reconcile against the
      // conversation a stopped answer was written to.
      let targetId = conversationId;

      try {
        if (!targetId) {
          const created = await createConversation(pageId, trimmed);
          targetId = created.id;
          setConversationId(created.id);
          setConversations((current) => [created, ...current]);
        }

        let answer = "";

        for await (const event of sendMessage(
          targetId,
          trimmed,
          controller.signal,
        )) {
          if (event.type === "status") {
            setStage(event.stage);
            setStageSince(Date.now());
            continue;
          }

          if (event.type === "delta") {
            answer += event.text;
            setStreaming(answer);
            // The arriving text is its own progress indicator from here.
            setStage(null);
            continue;
          }

          if (event.type === "done") {
            setMessages((current) => [
              ...current,
              {
                id: event.messageId,
                conversationId: targetId!,
                role: "ASSISTANT",
                content: event.content,
                createdAt: new Date().toISOString(),
              },
            ]);
            setStreaming("");
            settled = targetId;
            continue;
          }

          // The server persisted the question and any partial answer, so the
          // question is offered back rather than lost (FR-10).
          setError(event.message);
          setFailedQuestion(trimmed);
          setStreaming("");
          settled = targetId;
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          // An unmount aborts the same controller; only a deliberate stop
          // should touch state afterwards.
          if (!stopped.current) return;

          // Stopping is not a failure. The server persists whatever it
          // generated before the disconnect, so the thread is reconciled
          // against that rather than guessed at, and no error is shown.
          setStreaming("");
          settled = targetId;
        } else {
          setError(
            cause instanceof ApiError
              ? cause.message
              : "The question could not be sent",
          );
          setFailedQuestion(trimmed);
          setStreaming("");
        }
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        setPending(false);
        setStage(null);
        setStageSince(null);

        // Replace the optimistic view with the stored thread, so what is shown
        // is what would be seen on reopening the panel.
        if (settled && (!controller.signal.aborted || stopped.current)) {
          try {
            // A stopped request has an aborted signal, so the reconcile runs
            // unsignalled rather than being cancelled before it starts.
            const stored = await listMessages(settled);
            setMessages(stored);
          } catch {
            // Keep the optimistic view; it is close enough to carry on with.
          }
        }
      }
    },
    [conversationId, pageId, pending],
  );

  const stop = useCallback(() => {
    // The abort propagates to the server, which stops generating and persists
    // the partial answer; the catch above then reconciles the thread.
    stopped.current = true;
    inFlight.current?.abort();
  }, []);

  const startNewConversation = useCallback(async () => {
    if (!pageId) return;

    inFlight.current?.abort();
    setConversationId(null);
    setMessages([]);
    setStreaming("");
    setError(null);
    setFailedQuestion(null);
  }, [pageId]);

  const openConversation = useCallback(
    async (id: string) => {
      inFlight.current?.abort();
      setConversationId(id);
      setMessages([]);
      setStreaming("");
      setError(null);

      try {
        setMessages(await listMessages(id));
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Could not open that conversation",
        );
      }
    },
    [],
  );

  /** Persists the provider/model choice and adopts the server's new view. */
  const chooseProvider = useCallback(
    async (provider: AiProviderId, model?: string) => {
      const next = await setAiPreference(provider, model);
      setStatus(next);
    },
    [],
  );

  const dismissError = useCallback(() => {
    setError(null);
    setFailedQuestion(null);
  }, []);

  return {
    status,
    credentials,
    refreshAi,
    conversations,
    conversationId,
    messages,
    streaming,
    pending,
    error,
    failedQuestion,
    stage,
    stageSince,
    ask,
    stop,
    chooseProvider,
    startNewConversation,
    openConversation,
    dismissError,
  };
}
