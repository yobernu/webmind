import type { HighlightSelector } from '../interfaces/selector.interface.js';

export interface HighlightEntity {
  id: string;
  pageId: string;
  selectedText: string;
  selector: HighlightSelector | null;
  createdAt: Date;
}

/** The stored shape this maps from; `selector` is untyped JSON in the database. */
export interface HighlightRow {
  id: string;
  userId: string;
  pageId: string;
  selectedText: string;
  selector: unknown;
  createdAt: Date;
}
