import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import { searchKnowledge } from "../../api/search";
import type { Conversation, PageContext, SearchResult, SearchResultType } from "../../types";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

/** Matches the API's minimum query length. */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

const MARK_START = "";
const MARK_END = "";

const TYPE_LABELS: Record<SearchResultType, string> = {
  note: "Note",
  message: "Chat",
  highlight: "Highlight",
};

/** Turns the server's marked snippet into text with <mark> runs. */
function renderSnippet(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let rest = snippet;
  let key = 0;

  while (rest.length > 0) {
    const start = rest.indexOf(MARK_START);
    if (start === -1) {
      parts.push(rest);
      break;
    }
    const end = rest.indexOf(MARK_END, start);
    if (end === -1) {
      parts.push(rest.replace(MARK_START, ""));
      break;
    }

    if (start > 0) parts.push(rest.slice(0, start));
    parts.push(<mark key={key++}>{rest.slice(start + 1, end)}</mark>);
    rest = rest.slice(end + 1);
  }

  return parts;
}

function PageHistory({
  workspace,
  onOpenConversation,
}: {
  workspace: WorkspaceState;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const { counts, conversations, lastActivityAt } = workspace;

  return (
    <section className="history-section">
      <h3>This page</h3>
      <dl className="history-stats">
        <div>
          <dt>Conversations</dt>
          <dd>{counts.conversations}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{counts.notes}</dd>
        </div>
        <div>
          <dt>Highlights</dt>
          <dd>{counts.highlights}</dd>
        </div>
      </dl>
      <p className="hint">
        {lastActivityAt
          ? `Last activity ${formatRelative(lastActivityAt)}`
          : "Nothing saved on this page yet."}
      </p>

      {conversations.length > 0 && (
        <ul className="items">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className="history-row"
                onClick={() => onOpenConversation(conversation)}
              >
                <span className="history-row-title">{conversation.title ?? "Untitled"}</span>
                <span className="history-row-meta">
                  {conversation.messageCount ?? 0} messages ·{" "}
                  {formatRelative(conversation.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GlobalSearch({ onOpenResult }: { onOpenResult: (result: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();

  // A short query clears the results; that is adjusting state to input, which
  // belongs in the render pass rather than an effect.
  const [lastQuery, setLastQuery] = useState(trimmed);
  if (lastQuery !== trimmed) {
    setLastQuery(trimmed);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setError(null);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchKnowledge(trimmed, { limit: 30, signal: controller.signal })
        .then((found) => {
          setResults(found);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setError(cause instanceof ApiError ? cause.message : "Search failed");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  return (
    <section className="history-section">
      <h3>Search everything</h3>
      <input
        type="search"
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your notes, chats and highlights…"
        maxLength={200}
        aria-label="Search saved knowledge"
      />

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {searching && <p className="hint">Searching…</p>}
      {!searching && results?.length === 0 && (
        <p className="empty">Nothing saved matches “{trimmed}”.</p>
      )}

      {results && results.length > 0 && (
        <ul className="items">
          {results.map((result) => (
            <li key={`${result.type}-${result.id}`}>
              <button
                type="button"
                className="search-result"
                onClick={() => onOpenResult(result)}
              >
                <span className="search-result-head">
                  <span className="badge" data-type={result.type}>
                    {TYPE_LABELS[result.type]}
                  </span>
                  <span className="search-result-page" title={result.page.url}>
                    {result.page.title || result.page.domain}
                  </span>
                </span>
                <span className="search-result-snippet">{renderSnippet(result.snippet)}</span>
                <span className="history-row-meta">
                  {result.page.domain} · {formatRelative(result.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function History({
  context,
  workspace,
  onOpenConversation,
  onOpenResult,
}: {
  context: PageContext;
  workspace: WorkspaceState;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenResult: (result: SearchResult) => void;
}) {
  return (
    <div className="workspace-list">
      {context.page && (
        <PageHistory workspace={workspace} onOpenConversation={onOpenConversation} />
      )}
      <GlobalSearch onOpenResult={onOpenResult} />
    </div>
  );
}
