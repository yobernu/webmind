import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Note, PageContext, PanelIntent } from "../../types";
import {
  Button,
  EmptyState,
  Entry,
  EntryList,
  IconButton,
  InlineAlert,
  Quote,
  TextArea,
  useAutoGrow,
} from "../../ui";
import { formatRelative } from "../../utils/time";
import type { WorkspaceState } from "../useWorkspace";

/** Matches the API's MAX_NOTE_LENGTH. */
const MAX_NOTE_LENGTH = 20_000;

function NoteEntry({
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

  const edited = note.updatedAt !== note.createdAt;

  return (
    <li ref={ref}>
      <Entry
        as="div"
        tone="note"
        focused={focused}
        pinActions={confirming || editing}
        meta={
          saving ? (
            "Saving…"
          ) : (
            <time dateTime={note.updatedAt} title={new Date(note.updatedAt).toLocaleString()}>
              {formatRelative(note.updatedAt)}
              {edited && " · edited"}
            </time>
          )
        }
        actions={
          saving ? null : editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => void save()} disabled={!draft.trim()}>
                Save
              </Button>
            </>
          ) : confirming ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button size="sm" variant="danger" onClick={() => void onDelete()}>
                Delete note
              </Button>
            </>
          ) : (
            <>
              <IconButton
                size="sm"
                icon="edit"
                label="Edit note"
                onClick={() => {
                  setDraft(note.content);
                  setEditing(true);
                }}
              />
              <IconButton size="sm" icon="trash" label="Delete note" onClick={() => setConfirming(true)} />
            </>
          )
        }
      >
        {note.sourceText && <Quote clamp={3}>{note.sourceText}</Quote>}
        {editing ? (
          <TextArea
            label="Edit note"
            hideLabel
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
              if (event.key === "Escape") setEditing(false);
            }}
            maxLength={MAX_NOTE_LENGTH}
            autoFocus
          />
        ) : (
          <p className="note-text">{note.content}</p>
        )}
      </Entry>
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
  const composerRef = useAutoGrow(draft, 180);

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
  }, [composerRef, intent, onIntentHandled, page, workspace.notes]);

  if (!page) {
    return (
      <div className="screen-pad">
        <EmptyState title={context.status === "unsupported" ? "No notes on this page" : "Finding this page…"}>
          {context.status === "unsupported"
            ? "Gloss can’t save notes on browser pages, the Web Store or local files."
            : "Notes attach to the page once Gloss has identified it."}
        </EmptyState>
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

  const composing = draft.trim().length > 0 || sourceText !== null;

  return (
    <div className="notes">
      <form className="note-composer" onSubmit={(event) => void submit(event)}>
        {sourceText && (
          <div className="composer-quote">
            <Quote clamp={3}>{sourceText}</Quote>
            <IconButton size="sm" icon="close" label="Remove the quoted passage" onClick={() => setSourceText(null)} />
          </div>
        )}
        <textarea
          ref={composerRef}
          className="composer-input"
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          }}
          placeholder={sourceText ? "Your note on this passage…" : "Write a note about this page…"}
          aria-label="New note"
          maxLength={MAX_NOTE_LENGTH}
        />
        {composing && (
          <div className="note-composer-foot">
            <span className="note-composer-hint">Ctrl+Enter to save</span>
            <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!draft.trim()}>
              Save note
            </Button>
          </div>
        )}
      </form>

      <div className="screen-pad notes-list">
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
          <p className="list-status">Loading notes…</p>
        ) : workspace.notes.length === 0 ? (
          <EmptyState title="No notes on this page">
            Write one above, or select text on the page and choose Add note to quote it.
          </EmptyState>
        ) : (
          <EntryList label="Notes">
            {workspace.notes.map((note) => (
              <NoteEntry
                key={note.id}
                note={note}
                focused={note.id === focusedId}
                onSave={(content) => workspace.updateNote(note.id, content)}
                onDelete={() => workspace.deleteNote(note.id)}
              />
            ))}
          </EntryList>
        )}
      </div>
    </div>
  );
}
