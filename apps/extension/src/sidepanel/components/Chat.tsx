import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiProviderId, AiStage, AiStatus, PageContext } from "../../types";
import { useChat } from "../useChat";
import KeyManager from "./KeyManager";
import ModelPicker from "./ModelPicker";

/** Matches the API's MAX_QUESTION_LENGTH. */
const MAX_QUESTION_LENGTH = 4_000;

/** Wording for each phase the server reports. */
const STAGE_LABELS: Record<AiStage | "starting", string> = {
  starting: "Getting ready",
  reading: "Reading the page",
  searching: "Searching the page",
  thinking: "Thinking",
};

/** Below this, a timer would be noise rather than reassurance. */
const SLOW_AFTER_SECONDS = 6;

/** Human-readable provider name, falling back to the raw id. */
function providerLabel(status: AiStatus, id: AiProviderId): string {
  return status.providers.find((provider) => provider.id === id)?.label ?? id;
}

export default function Chat({ context }: { context: PageContext }) {
  const page = context.page;
  const chat = useChat(page?.id ?? null);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Advanced only by the interval, never synchronously in the effect or during
  // render. A value left over from a previous question is older than the
  // current phase's start, so the clamp below shows nothing until the first
  // tick — which is invisible against the 6s threshold.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!chat.pending) return;

    const timer = setInterval(() => setNow(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, [chat.pending]);

  const elapsed = chat.stageSince
    ? Math.max(0, Math.floor((now - chat.stageSince) / 1_000))
    : 0;

  // Follow the answer as it streams in.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [chat.messages, chat.streaming]);

  const aiDisabled = chat.status !== null && !chat.status.enabled;
  const canAsk = Boolean(page) && !aiDisabled && !chat.pending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canAsk) return;

    const question = draft;
    setDraft("");
    void chat.ask(question);
  };

  const retry = () => {
    if (!chat.failedQuestion) return;
    const question = chat.failedQuestion;
    chat.dismissError();
    void chat.ask(question);
  };

  if (!page) {
    return (
      <div className="placeholder">
        <h2>Chat</h2>
        <p>
          {context.status === "unsupported"
            ? "WebMind cannot read this kind of page, so there is nothing to ask about."
            : "Waiting for WebMind to identify this page."}
        </p>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-toolbar">
        {chat.conversations.length > 0 && (
          <select
            className="chat-picker"
            value={chat.conversationId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (value) void chat.openConversation(value);
            }}
            aria-label="Previous conversations"
          >
            <option value="">New conversation</option>
            {chat.conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title ?? "Untitled"}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="chat-new"
          onClick={() => void chat.startNewConversation()}
          disabled={chat.pending || chat.messages.length === 0}
        >
          New chat
        </button>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {chat.messages.length === 0 && !chat.streaming && (
          <p className="chat-empty">
            Ask anything about “{page.title ?? page.domain}”.
          </p>
        )}

        {chat.messages.map((message) => (
          <div
            key={message.id}
            className="chat-message"
            data-role={message.role.toLowerCase()}
          >
            {message.content}
          </div>
        ))}

        {chat.streaming && (
          <div className="chat-message" data-role="assistant" data-streaming="true">
            {chat.streaming}
          </div>
        )}

        {chat.pending && !chat.streaming && (
          <div
            className="chat-thinking"
            role="status"
            aria-live="polite"
            data-stage={chat.stage ?? "starting"}
          >
            <span className="chat-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              {STAGE_LABELS[chat.stage ?? "starting"]}
              {/* Withholding reasoning means a leaky model shows nothing until
                  its answer starts, so the wait needs to stay legible. */}
              {/* Only shown once a phase has visibly stalled, so a fast answer
                  is not cluttered with a timer. */}
              {elapsed >= SLOW_AFTER_SECONDS && ` · ${elapsed}s`}
            </span>
          </div>
        )}
      </div>

      {chat.error && (
        <div className="chat-error" role="alert">
          <p>{chat.error}</p>
          {chat.failedQuestion && (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      )}

      {aiDisabled && (
        <p className="chat-notice">
          AI answers are not configured on this server, so questions cannot be
          answered yet.
        </p>
      )}

      <form className="chat-composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(event);
            }
          }}
          placeholder={
            aiDisabled ? "AI is unavailable" : "Ask about this page…"
          }
          maxLength={MAX_QUESTION_LENGTH}
          rows={2}
          disabled={!canAsk}
        />
        {chat.pending ? (
          // Replaces Ask rather than sitting beside it: while an answer is
          // running, stopping it is the only useful action.
          <button type="button" className="chat-stop" onClick={chat.stop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!canAsk || draft.trim().length === 0}>
            Ask
          </button>
        )}
      </form>

      {chat.status && (
        <>
          <ModelPicker
            status={chat.status}
            onChange={chat.chooseProvider}
            disabled={chat.pending}
          />
          <KeyManager
            status={chat.status}
            credentials={chat.credentials}
            onChanged={chat.refreshAi}
          />
        </>
      )}

      {/* SRS §7: the extension must clearly indicate when page content is sent
          for AI processing. Naming the actual destination matters more now that
          the user can change it. */}
      <p className="chat-disclosure">
        This page’s text is sent to{" "}
        {chat.status?.selected
          ? `${providerLabel(chat.status, chat.status.selected.provider)} (${chat.status.selected.model})`
          : "the AI provider"}{" "}
        to answer your questions{chat.status?.selected?.usingUserKey ? " using your own API key" : ""}.
      </p>
    </div>
  );
}
