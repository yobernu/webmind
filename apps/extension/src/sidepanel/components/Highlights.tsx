import { useEffect, useState } from "react";
import type { Highlight, PageContext, PanelIntent } from "../../types";
import { sendToActiveTab } from "../../utils/page";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

function scrollTo(id: string) {
  void sendToActiveTab({ type: "SCROLL_TO_HIGHLIGHT", id });
}

function HighlightItem({
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
    <li className="highlight" data-missing={missing || undefined}>
      <button
        type="button"
        className="highlight-text"
        onClick={() => scrollTo(highlight.id)}
        disabled={missing}
        title={missing ? undefined : "Show on the page"}
      >
        {highlight.selectedText}
      </button>
      <div className="item-meta">
        <time dateTime={highlight.createdAt}>
          {formatRelative(highlight.createdAt)}
          {missing && " · not found on the page as it is now"}
        </time>
        <span className="item-actions">
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)}>
                Keep
              </button>
              <button type="button" className="danger" onClick={onDelete}>
                Remove
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onAsk}>
                Ask AI
              </button>
              <button type="button" onClick={onNote}>
                Note
              </button>
              <button type="button" onClick={() => setConfirming(true)}>
                Remove
              </button>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

export default function Highlights({
  context,
  workspace,
  missingIds,
  painted,
  intent,
  onIntentHandled,
  onIntent,
}: {
  context: PageContext;
  workspace: WorkspaceState;
  /** Highlights the content script could not re-anchor on the live page. */
  missingIds: ReadonlySet<string>;
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
      <div className="placeholder">
        <h2>Highlights</h2>
        <p>
          {context.status === "unsupported"
            ? "WebMind cannot highlight this kind of page."
            : "Waiting for WebMind to identify this page."}
        </p>
      </div>
    );
  }

  return (
    <div className="workspace-list">
      {workspace.error && (
        <div className="inline-error" role="alert">
          <p>{workspace.error}</p>
          <button type="button" onClick={workspace.dismissError}>
            Dismiss
          </button>
        </div>
      )}

      {workspace.loading ? (
        <p className="empty">Loading highlights…</p>
      ) : workspace.highlights.length === 0 ? (
        <p className="empty">
          Select text on the page and choose “Highlight” to save it here. Saved
          passages are marked again whenever you come back.
        </p>
      ) : (
        <ul className="items">
          {workspace.highlights.map((highlight) => (
            <HighlightItem
              key={highlight.id}
              highlight={highlight}
              missing={missingIds.has(highlight.id)}
              onAsk={() => onIntent({ kind: "ask", text: highlight.selectedText })}
              onNote={() => onIntent({ kind: "note", sourceText: highlight.selectedText })}
              onDelete={() => void workspace.deleteHighlight(highlight.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
