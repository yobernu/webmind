import type {
  HighlightEntity,
  HighlightRow,
} from '../entities/highlight.entity.js';
import type { HighlightSelector } from '../interfaces/selector.interface.js';

export function toHighlightResponse(highlight: HighlightRow): HighlightEntity {
  return {
    id: highlight.id,
    pageId: highlight.pageId,
    selectedText: highlight.selectedText,
    // Only ever written through CreateHighlightDto, so the shape is known.
    selector: (highlight.selector as HighlightSelector | null) ?? null,
    createdAt: highlight.createdAt,
  };
}
