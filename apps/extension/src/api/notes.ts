import type { Note } from "../types";
import { apiFetch } from "./client";

/** GET /pages/:id/notes */
export function listNotes(pageId: string, signal?: AbortSignal): Promise<Note[]> {
  return apiFetch<Note[]>(`/pages/${pageId}/notes`, { signal });
}

/** POST /pages/:id/notes */
export function createNote(
  pageId: string,
  content: string,
  sourceText?: string,
): Promise<Note> {
  return apiFetch<Note>(`/pages/${pageId}/notes`, {
    method: "POST",
    body: sourceText ? { content, sourceText } : { content },
  });
}

/** PATCH /notes/:id */
export function updateNote(noteId: string, content: string): Promise<Note> {
  return apiFetch<Note>(`/notes/${noteId}`, {
    method: "PATCH",
    body: { content },
  });
}

/** DELETE /notes/:id */
export function deleteNote(noteId: string): Promise<void> {
  return apiFetch<void>(`/notes/${noteId}`, { method: "DELETE" });
}
