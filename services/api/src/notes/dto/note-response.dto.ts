import type { NoteEntity, NoteRow } from '../entities/note.entity.js';

/** Drops `userId`: the caller already knows whose note it is. */
export function toNoteResponse(note: NoteRow): NoteEntity {
  return {
    id: note.id,
    pageId: note.pageId,
    content: note.content,
    sourceText: note.sourceText,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
