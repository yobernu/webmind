import { useEffect, useRef, useState } from "react";
import type { PageContext, PanelIntent } from "../../types";
import { useAutoGrow } from "../../ui";
import { providerLabel } from "../aiLabels";
import { composeQuestion, trimQuote } from "../quote";
import type { AiState } from "../useAi";
import { useChat } from "../useChat";
import ChatView from "./ChatView";

/**
 * The Ask tab: wires useChat, panel intents and the quoted passage into the
 * presentational ChatView.
 */
export default function Chat({
  context,
  ai,
  intent,
  onIntentHandled,
  onOpenSettings,
}: {
  context: PageContext;
  ai: AiState;
  intent: PanelIntent | null;
  onIntentHandled: () => void;
  onOpenSettings: () => void;
}) {
  const page = context.page;
  const chat = useChat(page?.id ?? null);
  const { openConversation } = chat;
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useAutoGrow(draft, 160);

  // Advanced only by the interval, never synchronously in the effect or during
  // render. A value left over from a previous question is older than the
  // current phase's start, so the clamp below shows nothing until the first
  // tick — which is invisible against the slow threshold.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!chat.pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [chat.pending]);

  const elapsed = chat.stageSince ? Math.max(0, Math.floor((now - chat.stageSince) / 1_000)) : 0;

  // Follow the answer as it streams in.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [chat.messages, chat.streaming, chat.pending]);

  // "Ask AI" on a selection, or a conversation picked from history or search.
  useEffect(() => {
    if (!intent || !page) return;

    if (intent.kind === "ask") {
      // Consuming a one-shot request from the parent, not deriving state.
      // oxlint-disable-next-line react/set-state-in-effect
      setQuote(trimQuote(intent.text));
      composerRef.current?.focus();
      onIntentHandled();
    } else if (intent.kind === "open-conversation" && intent.pageId === page.id) {
      void openConversation(intent.conversationId);
      onIntentHandled();
    }
  }, [composerRef, intent, onIntentHandled, openConversation, page]);

  const submit = () => {
    const question = composeQuestion(draft, quote);
    setDraft("");
    setQuote(null);
    void chat.ask(question);
  };

  const retry = () => {
    if (!chat.failedQuestion) return;
    const question = chat.failedQuestion;
    chat.dismissError();
    void chat.ask(question);
  };

  const status = ai.status;

  return (
    <ChatView
      pageTitle={page ? (page.title ?? page.domain) : null}
      unavailable={context.status === "unsupported" ? "unsupported" : "waiting"}
      messages={chat.messages}
      streaming={chat.streaming}
      pending={chat.pending}
      stage={chat.pending ? (chat.stage ?? "starting") : null}
      elapsedSeconds={elapsed}
      error={chat.error}
      canRetry={Boolean(chat.failedQuestion)}
      onRetry={retry}
      conversations={chat.conversations}
      conversationId={chat.conversationId}
      onOpenConversation={(id) => void chat.openConversation(id)}
      onNewChat={() => void chat.startNewConversation()}
      draft={draft}
      onDraftChange={setDraft}
      quote={quote}
      onClearQuote={() => setQuote(null)}
      onSubmit={submit}
      onStop={chat.stop}
      composerRef={composerRef}
      threadRef={threadRef}
      ai={{
        disabled: status !== null && !status.enabled,
        label: status?.selected ? providerLabel(status, status.selected.provider) : null,
        model: status?.selected?.model ?? null,
        usingUserKey: Boolean(status?.selected?.usingUserKey),
      }}
      onOpenSettings={onOpenSettings}
    />
  );
}
