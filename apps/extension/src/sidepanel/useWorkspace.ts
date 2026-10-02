import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import {
  createHighlight,
  deleteHighlight as deleteHighlightRequest,
} from "../api/highlights";
import {
  createNote,
  deleteNote as deleteNoteRequest,
  updateNote as updateNoteRequest,
} from "../api/notes";
import { fetchPageWorkspace } from "../api/pages";
import type {
  CapturedSelection,
  Conversation,
  Highlight,
  Note,
  PageWorkspace,
} from "../types";

export interface WorkspaceState {
  /** True until the first load for this page settles. */
  loading: boolean;
  error: string | null;
  notes: Note[];
  highlights: Highlight[];
  conversations: Conversation[];
  counts: PageWorkspace["counts"];
  lastActivityAt: string | null;
  /** Refetches everything, e.g. after the chat added a conversation. */
  refresh: () => Promise<void>;
  addNote: (content: string, sourceText?: string) => Promise<boolean>;
  updateNote: (id: string, content: string) => Promise<boolean>;
  deleteNote: (id: string) => Promise<boolean>;
  addHighlight: (selection: CapturedSelection) => Promise<Highlight | null>;
  deleteHighlight: (id: string) => Promise<boolean>;
  dismissError: () => void;
}

const EMPTY_COUNTS = { conversations: 0, notes: 0, highlights: 0 };

/** Optimistic rows get a temporary id until the server's arrives. */
const LOCAL_ID_PREFIX = "local-";

function describe(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

/**
 * Everything saved against one page (FR-08). Lives above the tabs so the
 * highlights stay painted and the counts stay current whichever tab is open.
 */
export function useWorkspace(pageId: string | null): WorkspaceState {
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);

  // A write that finishes after the user moved to another page must not land
  // in that page's lists.
  const currentPage = useRef(pageId);
  useEffect(() => {
    currentPage.current = pageId;
  }, [pageId]);

  const apply = useCallback((workspace: PageWorkspace) => {
    setNotes(workspace.notes);
    setHighlights(workspace.highlights);
    setConversations(workspace.conversations);
    setCounts(workspace.counts);
    setLastActivityAt(workspace.lastActivityAt);
    setLoadedFor(workspace.page.id);
  }, []);

  // Clearing on a page change is adjusting state to a prop, which React
  // documents as done during render rather than in an effect.
  const [shownFor, setShownFor] = useState(pageId);
  if (shownFor !== pageId) {
    setShownFor(pageId);
    setNotes([]);
    setHighlights([]);
    setConversations([]);
    setCounts(EMPTY_COUNTS);
    setLastActivityAt(null);
    setError(null);
  }

  useEffect(() => {
    if (!pageId) return;

    const controller = new AbortController();

    fetchPageWorkspace(pageId, controller.signal)
      .then((workspace) => {
        if (!controller.signal.aborted) apply(workspace);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.isBadCredentials) return;
        setError(describe(cause, "Could not load this page’s workspace"));
        setLoadedFor(pageId);
      });

    return () => controller.abort();
  }, [apply, pageId]);

  const refresh = useCallback(async () => {
    if (!pageId) return;
    try {
      const workspace = await fetchPageWorkspace(pageId);
      if (currentPage.current === pageId) apply(workspace);
    } catch (cause) {
      if (currentPage.current === pageId) {
        setError(describe(cause, "Could not refresh this page’s workspace"));
      }
    }
  }, [apply, pageId]);

  const bumpCount = (key: keyof PageWorkspace["counts"], delta: number) =>
    setCounts((current) => ({ ...current, [key]: Math.max(0, current[key] + delta) }));

  const touch = () => setLastActivityAt(new Date().toISOString());

  const addNote = useCallback(
    async (content: string, sourceText?: string) => {
      const trimmed = content.trim();
      if (!pageId || !trimmed) return false;

      const now = new Date().toISOString();
      const optimistic: Note = {
        id: `${LOCAL_ID_PREFIX}${Date.now()}`,
        pageId,
        content: trimmed,
        sourceText: sourceText?.trim() || null,
        createdAt: now,
        updatedAt: now,
      };

      setNotes((current) => [optimistic, ...current]);
      bumpCount("notes", 1);
      setError(null);

      try {
        const saved = await createNote(pageId, trimmed, sourceText?.trim() || undefined);
        if (currentPage.current !== pageId) return true;
        setNotes((current) =>
          current.map((note) => (note.id === optimistic.id ? saved : note)),
        );
        touch();
        return true;
      } catch (cause) {
        if (currentPage.current !== pageId) return false;
        setNotes((current) => current.filter((note) => note.id !== optimistic.id));
        bumpCount("notes", -1);
        setError(describe(cause, "The note could not be saved"));
        return false;
      }
    },
    [pageId],
  );

  const updateNote = useCallback(
    async (id: string, content: string) => {
      const trimmed = content.trim();
      const previous = notes.find((note) => note.id === id);
      if (!previous || !trimmed || id.startsWith(LOCAL_ID_PREFIX)) return false;

      setNotes((current) =>
        current.map((note) =>
          note.id === id
            ? { ...note, content: trimmed, updatedAt: new Date().toISOString() }
            : note,
        ),
      );
      setError(null);

      try {
        const saved = await updateNoteRequest(id, trimmed);
        setNotes((current) => current.map((note) => (note.id === id ? saved : note)));
        touch();
        return true;
      } catch (cause) {
        setNotes((current) => current.map((note) => (note.id === id ? previous : note)));
        setError(describe(cause, "The note could not be updated"));
        return false;
      }
    },
    [notes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const index = notes.findIndex((note) => note.id === id);
      if (index === -1 || id.startsWith(LOCAL_ID_PREFIX)) return false;
      const previous = notes[index];

      setNotes((current) => current.filter((note) => note.id !== id));
      bumpCount("notes", -1);
      setError(null);

      try {
        await deleteNoteRequest(id);
        return true;
      } catch (cause) {
        setNotes((current) => {
          const restored = [...current];
          restored.splice(Math.min(index, restored.length), 0, previous);
          return restored;
        });
        bumpCount("notes", 1);
        setError(describe(cause, "The note could not be deleted"));
        return false;
      }
    },
    [notes],
  );

  const addHighlight = useCallback(
    async (selection: CapturedSelection) => {
      if (!pageId) return null;
      setError(null);

      try {
        const saved = await createHighlight(pageId, selection.text, selection.selector);
        if (currentPage.current !== pageId) return saved;
        setHighlights((current) => [...current, saved]);
        bumpCount("highlights", 1);
        touch();
        return saved;
      } catch (cause) {
        if (currentPage.current === pageId) {
          setError(describe(cause, "The highlight could not be saved"));
        }
        return null;
      }
    },
    [pageId],
  );

  const deleteHighlight = useCallback(
    async (id: string) => {
      const index = highlights.findIndex((highlight) => highlight.id === id);
      if (index === -1) return false;
      const previous = highlights[index];

      setHighlights((current) => current.filter((highlight) => highlight.id !== id));
      bumpCount("highlights", -1);
      setError(null);

      try {
        await deleteHighlightRequest(id);
        return true;
      } catch (cause) {
        setHighlights((current) => {
          const restored = [...current];
          restored.splice(Math.min(index, restored.length), 0, previous);
          return restored;
        });
        bumpCount("highlights", 1);
        setError(describe(cause, "The highlight could not be deleted"));
        return false;
      }
    },
    [highlights],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    loading: Boolean(pageId) && loadedFor !== pageId,
    error,
    notes,
    highlights,
    conversations,
    counts,
    lastActivityAt,
    refresh,
    addNote,
    updateNote,
    deleteNote,
    addHighlight,
    deleteHighlight,
    dismissError,
  };
}
