import { useEffect, useState } from "react";
import type { Highlight, PageContext, PanelIntent } from "../../types";
import { Button, EmptyState, Entry, EntryList, IconButton, InlineAlert, Quote } from "../../ui";
import { sendToActiveTab } from "../../utils/page";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

function scrollTo(id: string) {
  void sendToActiveTab({ type: "SCROLL_TO_HIGHLIGHT", id });
}

function HighlightEntry({
  highlight,
  missing,
  onAsk,
  onNote,
  onDelete,
}: {
  highlight: Highlight;
  missing: boolean;
  onAsk: () => void;
  onNote: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Entry
      as="li"
      tone={missing ? "muted" : "highlight"}
      pinActions={confirming}
      meta={
        missing ? (
          "Not found on this version of the page"
        ) : (
          <time dateTime={highlight.createdAt}>{formatRelative(highlight.createdAt)}</time>
        )
      }
      actions={
        confirming ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Remove
            </Button>
          </>
        ) : (
          <>
            <IconButton size="sm" icon="ask" label="Ask about this passage" onClick={onAsk} />
            <IconButton size="sm" icon="note" label="Add a note on this passage" onClick={onNote} />
            <IconButton size="sm" icon="trash" label="Remove highlight" onClick={() => setConfirming(true)} />
          </>
        )
      }
    >
      {missing ? (
        <Quote clamp={6}>{highlight.selectedText}</Quote>
      ) : (
        <button
          type="button"
          className="highlight-jump"
          onClick={() => scrollTo(highlight.id)}
          aria-label={`Show on the page: ${highlight.selectedText.slice(0, 80)}`}
        >
          <Quote clamp={6}>{highlight.selectedText}</Quote>
        </button>
      )}
    </Entry>
  );
}

export default function Highlights({
  context,
  workspace,
  missingIds,
  paintSupported = true,
  painted,
  intent,
  onIntentHandled,
  onIntent,
}: {
  context: PageContext;
  workspace: WorkspaceState;
  /** Highlights the content script could not re-anchor on the live page. */
  missingIds: ReadonlySet<string>;
  /** False when this browser can't mark passages on the page at all. */
  paintSupported?: boolean;
  /** Whether the latest set has been painted, so scrolling can find it. */
  painted: boolean;
  intent: PanelIntent | null;
  onIntentHandled: () => void;
  onIntent: (intent: PanelIntent) => void;
}) {
  const page = context.page;

  // A highlight picked from search scrolls into view once it is painted.
  useEffect(() => {
    if (intent?.kind !== "focus-highlight" || !page || intent.pageId !== page.id) return;
    if (!painted) return;

    if (!missingIds.has(intent.highlightId)) scrollTo(intent.highlightId);
    onIntentHandled();
  }, [intent, missingIds, onIntentHandled, page, painted]);

  if (!page) {
    return (
      <div className="screen-pad">
        <EmptyState title={context.status === "unsupported" ? "Can’t highlight here" : "Finding this page…"}>
          {context.status === "unsupported"
            ? "Browser pages, the Web Store and local files can’t be highlighted."
            : "Highlights attach to the page once Gloss has identified it."}
        </EmptyState>
      </div>
    );
  }

  const missingCount = workspace.highlights.filter((highlight) => missingIds.has(highlight.id)).length;

  return (
    <div className="screen-pad">
      {workspace.error && (
        <InlineAlert
          tone="error"
          action={
            <Button size="sm" variant="ghost" onClick={workspace.dismissError}>
              Dismiss
            </Button>
          }
        >
          <p>{workspace.error}</p>
        </InlineAlert>
      )}

      {workspace.loading ? (
        <p className="list-status">Loading highlights…</p>
      ) : workspace.highlights.length === 0 ? (
        <EmptyState title="Nothing highlighted yet">
          Select text on the page and choose Highlight. Gloss marks it again whenever you come back.
        </EmptyState>
      ) : (
        <>
          {!paintSupported && (
            <p className="list-status">This browser can’t mark highlights on the page; they’re kept here.</p>
          )}
          {missingCount > 0 && (
            <p className="list-status">
              {missingCount === 1
                ? "1 passage has changed or moved on the page."
                : `${missingCount} passages have changed or moved on the page.`}
            </p>
          )}
          <EntryList label="Highlights">
            {workspace.highlights.map((highlight) => (
              <HighlightEntry
                key={highlight.id}
                highlight={highlight}
                missing={missingIds.has(highlight.id)}
                onAsk={() => onIntent({ kind: "ask", text: highlight.selectedText })}
                onNote={() => onIntent({ kind: "note", sourceText: highlight.selectedText })}
                onDelete={() => void workspace.deleteHighlight(highlight.id)}
              />
            ))}
          </EntryList>
        </>
      )}
    </div>
  );
}
