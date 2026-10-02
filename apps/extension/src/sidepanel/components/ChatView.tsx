import type { FormEvent, RefObject } from "react";
import type { AiStage, ChatMessage, Conversation } from "../../types";
import { Button, EmptyState, IconButton, InlineAlert, Prose, Quote, Spinner, TextButton } from "../../ui";
import { questionBudget, splitQuestion } from "../quote";

/** Wording for each phase the server reports. */
const STAGE_LABELS: Record<AiStage | "starting", string> = {
  starting: "Getting ready",
  reading: "Reading the page",
  searching: "Searching the page",
  thinking: "Thinking",
};

/** Below this, a timer would be noise rather than reassurance. */
const SLOW_AFTER_SECONDS = 6;

export interface ChatViewProps {
  /** Null while there is no page to ask about. */
  pageTitle: string | null;
  unavailable?: "unsupported" | "waiting";
  messages: ChatMessage[];
  /** Answer text arriving right now. */
  streaming: string;
  pending: boolean;
  stage: AiStage | "starting" | null;
  elapsedSeconds: number;
  error: string | null;
  canRetry: boolean;
  onRetry: () => void;
  conversations: Conversation[];
  conversationId: string | null;
  onOpenConversation: (id: string) => void;
  onNewChat: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  quote: string | null;
  onClearQuote: () => void;
  onSubmit: () => void;
  onStop: () => void;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  threadRef?: RefObject<HTMLDivElement | null>;
  ai: {
    /** No provider can answer for this user. */
    disabled: boolean;
    /** Provider that receives the page, e.g. "Anthropic Claude". */
    label: string | null;
    /** The model, shown as a tooltip on the provider name. */
    model?: string | null;
    usingUserKey: boolean;
  };
  onOpenSettings: () => void;
}

function UserTurn({ content }: { content: string }) {
  const { quote, question } = splitQuestion(content);
  return (
    <div className="turn turn-user">
      {quote && <Quote clamp={4}>{quote}</Quote>}
      {question && <p className="turn-user-text">{question}</p>}
    </div>
  );
}

function AssistantTurn({ content, streaming, incomplete }: { content: string; streaming?: boolean; incomplete?: boolean }) {
  return (
    <div className="turn turn-assistant">
      <Prose text={content} trailing={streaming ? <span className="caret" aria-hidden="true" /> : null} />
      {incomplete && <p className="turn-note">Stopped before it finished.</p>}
    </div>
  );
}

export default function ChatView(props: ChatViewProps) {
  const {
    pageTitle,
    unavailable,
    messages,
    streaming,
    pending,
    stage,
    elapsedSeconds,
    error,
    canRetry,
    onRetry,
    conversations,
    conversationId,
    onOpenConversation,
    onNewChat,
    draft,
    onDraftChange,
    quote,
    onClearQuote,
    onSubmit,
    onStop,
    composerRef,
    threadRef,
    ai,
    onOpenSettings,
  } = props;

  if (pageTitle === null) {
    return (
      <div className="screen-pad">
        <EmptyState title={unavailable === "unsupported" ? "Nothing to read here" : "Finding this page…"}>
          {unavailable === "unsupported"
            ? "Browser pages, the Web Store and local files can’t be read, so there is nothing to ask about."
            : "Gloss is identifying the page in this tab."}
        </EmptyState>
      </div>
    );
  }

  const canAsk = !ai.disabled && !pending;
  const ready = draft.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canAsk && ready) onSubmit();
  };

  return (
    <div className="ask">
      {(conversations.length > 0 || messages.length > 0) && (
        <div className="ask-toolbar">
          {conversations.length > 0 ? (
            <div className="ask-picker">
              <select
                value={conversationId ?? ""}
                onChange={(event) => event.target.value && onOpenConversation(event.target.value)}
                aria-label="Conversation on this page"
                disabled={pending}
              >
                {!conversationId && <option value="">New conversation</option>}
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title ?? "Untitled conversation"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="ask-picker-label">New conversation</span>
          )}
          <Button size="sm" variant="ghost" icon="plus" onClick={onNewChat} disabled={pending || messages.length === 0}>
            New
          </Button>
        </div>
      )}

      <div className="ask-thread" ref={threadRef} aria-live="polite" aria-busy={pending}>
        {messages.length === 0 && !streaming && !pending && (
          <EmptyState title="Ask about this page">
            Answers come from “{pageTitle}”. Select text on the page to ask about a passage.
          </EmptyState>
        )}

        {messages.map((message) =>
          message.role === "USER" ? (
            <UserTurn key={message.id} content={message.content} />
          ) : (
            <AssistantTurn key={message.id} content={message.content} incomplete={message.incomplete} />
          ),
        )}

        {streaming && <AssistantTurn content={streaming} streaming />}

        {pending && !streaming && (
          <p className="ask-status" role="status">
            <Spinner size={12} />
            {STAGE_LABELS[stage ?? "starting"]}
            {elapsedSeconds >= SLOW_AFTER_SECONDS && (
              <span className="ask-elapsed">{elapsedSeconds}s</span>
            )}
          </p>
        )}

        {error && (
          <InlineAlert
            tone="error"
            action={
              canRetry && (
                <Button size="sm" variant="ghost" icon="retry" onClick={onRetry}>
                  Try again
                </Button>
              )
            }
          >
            <p>{error}</p>
          </InlineAlert>
        )}
      </div>

      <div className="ask-dock">
        {ai.disabled && (
          <InlineAlert
            tone="warning"
            action={
              <Button size="sm" variant="ghost" onClick={onOpenSettings}>
                Settings
              </Button>
            }
          >
            <p>No AI provider is set up for your account yet.</p>
          </InlineAlert>
        )}

        <form className="composer" onSubmit={submit} data-disabled={ai.disabled || undefined}>
          {quote && (
            <div className="composer-quote">
              <Quote clamp={3}>{quote}</Quote>
              <IconButton size="sm" icon="close" label="Remove the quoted passage" onClick={onClearQuote} />
            </div>
          )}
          <div className="composer-row">
            <textarea
              ref={composerRef}
              className="composer-input"
              value={draft}
              rows={1}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  submit(event);
                }
              }}
              placeholder={quote ? "Ask about this passage…" : "Ask about this page…"}
              aria-label="Your question"
              maxLength={questionBudget(quote)}
              disabled={ai.disabled}
            />
            {pending ? (
              <IconButton icon="stop" label="Stop answering" variant="solid" onClick={onStop} />
            ) : (
              <IconButton icon="send" label="Ask" variant="solid" type="submit" disabled={!canAsk || !ready} />
            )}
          </div>
        </form>

        {/* SRS §7: say plainly where the page text goes, naming the provider. */}
        <p className="ask-footnote">
          {ai.label ? (
            <>
              <span className="ask-footnote-model" title={ai.model ?? undefined}>
                {ai.label}
              </span>{" "}
              receives this page’s text{ai.usingUserKey ? " · your key" : ""}.{" "}
            </>
          ) : (
            "This page’s text is sent to the AI provider to answer. "
          )}
          <TextButton onClick={onOpenSettings}>Change</TextButton>
        </p>
      </div>
    </div>
  );
}
