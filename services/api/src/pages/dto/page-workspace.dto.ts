import type { ConversationEntity } from '../../conversations/entities/conversation.entity.js';
import type { HighlightEntity } from '../../highlights/entities/highlight.entity.js';
import type { NoteEntity } from '../../notes/entities/note.entity.js';
import type { PageEntity } from '../entities/page.entity.js';

/** A page plus what the user has accumulated on it (FR-08, PRD §9.6). */
export interface PageWorkspaceResponse {
  page: PageEntity;
  /** Most recently active first, capped; `counts` has the true total. */
  conversations: ConversationEntity[];
  notes: NoteEntity[];
  highlights: HighlightEntity[];
  counts: {
    conversations: number;
    notes: number;
    highlights: number;
  };
  /** Latest change across the page's conversations, notes and highlights;
   * null when nothing has been saved on it yet. */
  lastActivityAt: Date | null;
}
