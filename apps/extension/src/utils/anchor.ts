import type { HighlightSelector } from '../types'

/**
 * Text anchoring for highlights.
 *
 * A highlight is stored as the quoted text plus a little context either side
 * (the W3C Web Annotation "text quote" selector), with character offsets as a
 * tiebreaker. Re-finding it searches the page's text for the quote rather than
 * trusting the offsets, because offsets drift whenever anything above the
 * passage changes — an ad slot, a cookie banner, a comment count.
 */

/** Context kept either side of a quote. Must not exceed the API's limit (64). */
export const AFFIX_LENGTH = 32

/** Elements whose text the user never sees as prose. */
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA'])

/** The page's visible text flattened into one string, with a map back to the
 * DOM text nodes it came from. */
export interface TextIndex {
  text: string
  nodes: Text[]
  /** Offset in `text` at which each node's data begins. */
  starts: number[]
}

export function buildTextIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document)
  const nodes: Text[] = []
  const starts: number[] = []
  const parts: string[] = []
  let length = 0

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let parent = node.parentNode; parent && parent !== root; parent = parent.parentNode) {
        if (parent.nodeType === Node.ELEMENT_NODE && SKIPPED_TAGS.has((parent as Element).tagName)) {
          return NodeFilter.FILTER_REJECT
        }
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    nodes.push(text)
    starts.push(length)
    parts.push(text.data)
    length += text.data.length
  }

  return { text: parts.join(''), nodes, starts }
}

/** Character offsets of a DOM range within the index, or null if the range
 * covers no indexed text. */
export function rangeToOffsets(
  range: Range,
  index: TextIndex,
): { start: number; end: number } | null {
  let start = -1
  let end = -1

  for (let i = 0; i < index.nodes.length; i++) {
    const node = index.nodes[i]
    if (!range.intersectsNode(node)) continue

    const from = node === range.startContainer ? range.startOffset : 0
    const to = node === range.endContainer ? range.endOffset : node.data.length

    if (start < 0) start = index.starts[i] + from
    end = index.starts[i] + to
  }

  return start >= 0 && end > start ? { start, end } : null
}

/** The DOM position of a character offset. At a boundary between two nodes,
 * a range end belongs to the earlier node and a range start to the later one,
 * so neither picks up an empty sliver of its neighbour. */
function offsetToPoint(
  index: TextIndex,
  offset: number,
  isEnd: boolean,
): { node: Text; offset: number } | null {
  const { nodes, starts } = index
  if (nodes.length === 0) return null

  // Last node starting at or before the offset.
  let low = 0
  let high = nodes.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }

  let i = low
  if (isEnd && i > 0 && starts[i] === offset) i -= 1
  // Skip empty text nodes, which cannot hold a visible boundary.
  while (!isEnd && i < nodes.length - 1 && nodes[i].data.length === 0) i += 1

  const node = nodes[i]
  return { node, offset: Math.max(0, Math.min(node.data.length, offset - starts[i])) }
}

export function offsetsToRange(index: TextIndex, start: number, end: number): Range | null {
  const from = offsetToPoint(index, start, false)
  const to = offsetToPoint(index, end, true)
  if (!from || !to) return null

  const range = from.node.ownerDocument.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)

  return range.collapsed ? null : range
}

/** Builds the selector stored with a highlight. */
export function describeRange(range: Range, index: TextIndex): HighlightSelector | null {
  const offsets = rangeToOffsets(range, index)
  if (!offsets) return null

  const { start, end } = offsets
  const exact = index.text.slice(start, end)
  if (!exact.trim()) return null

  return {
    quote: {
      exact,
      prefix: index.text.slice(Math.max(0, start - AFFIX_LENGTH), start),
      suffix: index.text.slice(end, end + AFFIX_LENGTH),
    },
    position: { start, end },
  }
}

/** Length of the shared tail of two strings. */
function sharedSuffix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/** Length of the shared head of two strings. */
function sharedPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/** Collapses whitespace runs to one space, keeping a map back to the original
 * offsets. Layout changes often alter whitespace without changing words. */
function normalizeWhitespace(text: string): { text: string; map: number[] } {
  const map: number[] = []
  let out = ''
  let inSpace = false

  for (let i = 0; i < text.length; i++) {
    const isSpace = /\s/.test(text[i])
    if (isSpace && inSpace) continue
    inSpace = isSpace
    out += isSpace ? ' ' : text[i]
    map.push(i)
  }
  map.push(text.length)

  return { text: out, map }
}

/** Every occurrence of `needle` in `haystack`, capped so a one-letter quote on
 * a huge page cannot stall the tab. */
function occurrences(haystack: string, needle: string, cap = 500): number[] {
  const found: number[] = []
  let from = 0
  while (found.length < cap) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    found.push(at)
    from = at + 1
  }
  return found
}

/**
 * Finds the best match for a stored selector: the occurrence whose
 * surroundings agree most with the stored prefix and suffix, with closeness to
 * the stored offset breaking ties. Falls back to a whitespace-insensitive
 * search when the exact text is no longer present.
 */
export function anchorSelector(
  selector: HighlightSelector,
  index: TextIndex,
): { start: number; end: number } | null {
  const { exact, prefix = '', suffix = '' } = selector.quote
  if (!exact) return null

  const pick = (text: string, quote: string, before: string, after: string, hint?: number) => {
    let best: number | null = null
    let bestScore = -Infinity

    for (const at of occurrences(text, quote)) {
      let score =
        sharedSuffix(text.slice(Math.max(0, at - before.length), at), before) +
        sharedPrefix(text.slice(at + quote.length, at + quote.length + after.length), after)

      // Always under one point, so context outweighs position.
      if (hint !== undefined) score -= Math.abs(at - hint) / (text.length + 1)

      if (score > bestScore) {
        bestScore = score
        best = at
      }
    }

    return best
  }

  const direct = pick(index.text, exact, prefix, suffix, selector.position?.start)
  if (direct !== null) return { start: direct, end: direct + exact.length }

  const page = normalizeWhitespace(index.text)
  const quote = normalizeWhitespace(exact).text.trim()
  if (!quote) return null

  const loose = pick(
    page.text,
    quote,
    normalizeWhitespace(prefix).text,
    normalizeWhitespace(suffix).text,
  )
  if (loose === null) return null

  return { start: page.map[loose], end: page.map[loose + quote.length - 1] + 1 }
}
