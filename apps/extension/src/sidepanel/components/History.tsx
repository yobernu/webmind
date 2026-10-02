import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import { searchKnowledge } from "../../api/search";
import type { Conversation, PageContext, SearchResult, SearchResultType } from "../../types";
import { EmptyState, InlineAlert, Spinner, TextField } from "../../ui";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

/** Matches the API's minimum query length. */
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

const MARK_START = "";
const MARK_END = "";

const GROUPS: { type: SearchResultType; label: string }[] = [
  { type: "note", label: "Notes" },
  { type: "message", label: "Conversations" },
  { type: "highlight", label: "Highlights" },
];

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

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function PageHistory({
  workspace,
  onOpenConversation,
}: {
  workspace: WorkspaceState;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const { counts, conversations, lastActivityAt } = workspace;
  const nothing = counts.conversations + counts.notes + counts.highlights === 0;

  return (
    <section className="history-section" aria-labelledby="history-page">
      <h2 id="history-page" className="section-label">
        This page
      </h2>
      <p className="history-summary">
        {nothing ? (
          "Nothing saved on this page yet."
        ) : (
          <>
            {plural(counts.conversations, "conversation", "conversations")} ·{" "}
            {plural(counts.notes, "note", "notes")} · {plural(counts.highlights, "highlight", "highlights")}
            {lastActivityAt && <> · active {formatRelative(lastActivityAt)}</>}
          </>
        )}
      </p>

      {conversations.length > 0 && (
        <ul className="row-list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" className="row" data-tone="conversation" onClick={() => onOpenConversation(conversation)}>
                <span className="row-title">{conversation.title ?? "Untitled conversation"}</span>
                <span className="row-meta">
                  {plural(conversation.messageCount ?? 0, "message", "messages")} ·{" "}
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

/** Search hits grouped by kind, each naming its source page. */
export function SearchResults({
  results,
  onOpenResult,
}: {
  results: SearchResult[];
  onOpenResult: (result: SearchResult) => void;
}) {
  return (
    <>
      {GROUPS.map(({ type, label }) => {
        const group = results.filter((result) => result.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} className="result-group">
            <h3 className="result-group-label">
              {label} <span>{group.length}</span>
            </h3>
            <ul className="row-list">
              {group.map((result) => (
                <li key={result.id}>
                  <button type="button" className="row" data-tone={type} onClick={() => onOpenResult(result)}>
                    <span className="row-title" title={result.page.url}>
                      {result.page.title || result.page.domain}
                    </span>
                    <span className="row-snippet" dir="auto">
                      {renderSnippet(result.snippet)}
                    </span>
                    <span className="row-meta">
                      {result.page.domain} · {formatRelative(result.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
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
    <section className="history-section" aria-labelledby="history-search">
      <h2 id="history-search" className="section-label">
        Everything you’ve saved
      </h2>
      <TextField
        label="Search saved notes, conversations and highlights"
        hideLabel
        icon="search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search notes, chats and highlights"
        maxLength={200}
      />

      {error && (
        <InlineAlert tone="error">
          <p>{error}</p>
        </InlineAlert>
      )}

      {searching && (
        <p className="list-status">
          <Spinner size={11} /> Searching
        </p>
      )}

      {!searching && results?.length === 0 && (
        <EmptyState title="No matches">Nothing you’ve saved mentions “{trimmed}”.</EmptyState>
      )}

      {!searching && results && results.length > 0 && (
        <SearchResults results={results} onOpenResult={onOpenResult} />
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
    <div className="history">
      {context.page && <PageHistory workspace={workspace} onOpenConversation={onOpenConversation} />}
      <GlobalSearch onOpenResult={onOpenResult} />
    </div>
  );
}
