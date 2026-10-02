import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Note, PageContext, PanelIntent } from "../../types";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

/** Matches the API's MAX_NOTE_LENGTH. */
const MAX_NOTE_LENGTH = 20_000;

function NoteItem({
  note,
  focused,
  onSave,
  onDelete,
}: {
  note: Note;
  focused: boolean;
  onSave: (content: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);
  const saving = note.id.startsWith("local-");

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const save = async () => {
    if (draft.trim() === note.content) {
      setEditing(false);
      return;
    }
    if (await onSave(draft)) setEditing(false);
  };

  return (
    <li className="note" ref={ref} data-focused={focused || undefined}>
      {note.sourceText && <blockquote className="quote">{note.sourceText}</blockquote>}

      {editing ? (
        <>
          <textarea
            className="note-editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
              if (event.key === "Escape") setEditing(false);
            }}
            maxLength={MAX_NOTE_LENGTH}
            rows={4}
            autoFocus
          />
          <div className="item-actions">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={!draft.trim()}
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note-content">{note.content}</p>
          <div className="item-meta">
            <time dateTime={note.updatedAt} title={new Date(note.updatedAt).toLocaleString()}>
              {saving ? "Saving…" : formatRelative(note.updatedAt)}
              {note.updatedAt !== note.createdAt && !saving && " · edited"}
            </time>
            {!saving && (
              <span className="item-actions">
                {confirming ? (
                  <>
                    <button type="button" onClick={() => setConfirming(false)}>
                      Keep
                    </button>
                    <button type="button" className="danger" onClick={() => void onDelete()}>
                      Delete note
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(note.content);
                        setEditing(true);
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => setConfirming(true)}>
                      Delete
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export default function Notes({
  context,
  workspace,
  intent,
  onIntentHandled,
}: {
  context: PageContext;
  workspace: WorkspaceState;
  intent: PanelIntent | null;
  onIntentHandled: () => void;
}) {
  const page = context.page;
  const [draft, setDraft] = useState("");
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // A selection's "Add note", or a note picked from search, arrives as an
  // intent from the panel.
  useEffect(() => {
    if (!intent || !page) return;

    if (intent.kind === "note") {
      // Consuming a one-shot request from the parent, not deriving state.
      // oxlint-disable-next-line react/set-state-in-effect
      setSourceText(intent.sourceText);
      composerRef.current?.focus();
      onIntentHandled();
    } else if (intent.kind === "focus-note" && intent.pageId === page.id) {
      if (workspace.notes.some((note) => note.id === intent.noteId)) {
        setFocusedId(intent.noteId);
        onIntentHandled();
      }
    }
  }, [intent, onIntentHandled, page, workspace.notes]);

  if (!page) {
    return (
      <div className="placeholder">
        <h2>Notes</h2>
        <p>
          {context.status === "unsupported"
            ? "WebMind cannot save notes on this kind of page."
            : "Waiting for WebMind to identify this page."}
        </p>
      </div>
    );
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim() || saving) return;

    setSaving(true);
    const saved = await workspace.addNote(draft, sourceText ?? undefined);
    setSaving(false);

    if (saved) {
      setDraft("");
      setSourceText(null);
    }
  };

  return (
    <div className="workspace-list">
      <form className="note-composer" onSubmit={(event) => void submit(event)}>
        {sourceText && (
          <div className="quote-chip">
            <blockquote className="quote">{sourceText}</blockquote>
            <button
              type="button"
              aria-label="Remove the quoted passage"
              onClick={() => setSourceText(null)}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          }}
          placeholder={sourceText ? "Your note on this passage…" : "Write a note about this page…"}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
        />
        <div className="note-composer-row">
          <span className="hint">Ctrl+Enter to save</span>
          <button type="submit" className="primary" disabled={!draft.trim() || saving}>
            Save note
          </button>
        </div>
      </form>

      {workspace.error && (
        <div className="inline-error" role="alert">
          <p>{workspace.error}</p>
          <button type="button" onClick={workspace.dismissError}>
            Dismiss
          </button>
        </div>
      )}

      {workspace.loading ? (
        <p className="empty">Loading notes…</p>
      ) : workspace.notes.length === 0 ? (
        <p className="empty">
          No notes on this page yet. Select text on the page and choose “Add note” to
          quote it.
        </p>
      ) : (
        <ul className="items">
          {workspace.notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              focused={note.id === focusedId}
              onSave={(content) => workspace.updateNote(note.id, content)}
              onDelete={() => workspace.deleteNote(note.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
