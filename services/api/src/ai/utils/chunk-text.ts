/** Target chunk size. Small enough that a hit is specific, large enough to
 * carry an argument rather than a fragment. */
export const CHUNK_SIZE = 1_500;

/** Overlap so a sentence spanning a boundary is retrievable from either side. */
export const CHUNK_OVERLAP = 200;

/** Break candidates are only accepted in the last fifth of a chunk, so a chunk
 * is never much shorter than the target just because a full stop appeared. */
const BREAK_SEARCH_FRACTION = 0.8;

/** Moves an offset forward to the start of the next whole word. */
function alignToWordStart(text: string, offset: number): number {
  if (offset <= 0 || offset >= text.length) return offset;
  if (text[offset - 1] === ' ') return offset;

  const nextSpace = text.indexOf(' ', offset);

  return nextSpace === -1 ? text.length : nextSpace + 1;
}

/**
 * Splits text into overlapping chunks, breaking at sentence or word boundaries.
 *
 * Both ends matter: aligning only the end still lets the overlapped *start* of
 * the following chunk land mid-word, which produces chunks beginning with
 * fragments like "harlie delta" and embeds worse.
 */
export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= size) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);

    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const floor = Math.floor(size * BREAK_SEARCH_FRACTION);

      const sentence = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
      );

      if (sentence >= floor) {
        end = start + sentence + 1;
      } else {
        const space = window.lastIndexOf(' ');
        if (space >= floor) end = start + space;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    if (end >= normalized.length) break;

    const desired = Math.max(end - overlap, start + 1);
    const aligned = alignToWordStart(normalized, desired);

    // Aligning must never move the start past the previous chunk's end: with a
    // long unbroken token (base64, minified script, a giant URL) the next space
    // can be far away or absent, and jumping to it would drop that text from
    // every chunk. Losing the overlap is acceptable; losing content is not.
    start = aligned > start && aligned < end ? aligned : end;
  }

  return chunks;
}
