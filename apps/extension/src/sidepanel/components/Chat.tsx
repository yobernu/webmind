import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiProviderId, AiStatus, PageContext } from "../../types";
import { useChat } from "../useChat";
import ModelPicker from "./ModelPicker";

/** Matches the API's MAX_QUESTION_LENGTH. */
const MAX_QUESTION_LENGTH = 4_000;

/** Human-readable provider name, falling back to the raw id. */
function providerLabel(status: AiStatus, id: AiProviderId): string {
  return status.providers.find((provider) => provider.id === id)?.label ?? id;
}

export default function Chat({ context }: { context: PageContext }) {
  const page = context.page;
  const chat = useChat(page?.id ?? null);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

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
          <div className="chat-thinking" role="status">
            Reading the page…
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
        <button type="submit" disabled={!canAsk || draft.trim().length === 0}>
          {chat.pending ? "…" : "Ask"}
        </button>
      </form>

      {chat.status && (
        <ModelPicker
          status={chat.status}
          onChange={chat.chooseProvider}
          disabled={chat.pending}
        />
      )}

      {/* SRS §7: the extension must clearly indicate when page content is sent
          for AI processing. Naming the actual destination matters more now that
          the user can change it. */}
      <p className="chat-disclosure">
        This page’s text is sent to{" "}
        {chat.status?.selected
          ? `${providerLabel(chat.status, chat.status.selected.provider)} (${chat.status.selected.model})`
          : "the AI provider"}{" "}
        to answer your questions.
      </p>
    </div>
  );
}
