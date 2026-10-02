/** A note as the extension sees it. */
export interface NoteEntity {
  id: string;
  pageId: string;
  content: string;
  /** The passage the note was written against, when it came from a selection. */
  sourceText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The stored shape this maps from. */
export interface NoteRow {
  id: string;
  userId: string;
  pageId: string;
  content: string;
  sourceText: string | null;
  createdAt: Date;
  updatedAt: Date;
}
