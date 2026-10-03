import type { PaintableHighlight } from '../types'
import { anchorSelector, buildTextIndex, offsetsToRange, type TextIndex } from '../utils/anchor'

const HIGHLIGHT_NAME = 'gloss'
const ACTIVE_NAME = 'gloss-active'
const STYLE_ID = 'gloss-highlight-style'

/**
 * Paints saved highlights with the CSS Custom Highlight API, which styles
 * ranges without inserting a single element into the page. Wrapping text in
 * <mark> tags would break frameworks that own their DOM and change what the
 * page's own scripts see.
 */
const painted = new Map<string, Range>()

export function paintingSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  // Highlighter yellow, translucent so the page's own text colour still reads.
  // The active state (scrolled to from the panel) deepens and underlines,
  // since ::highlight only accepts colour, background and decoration.
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(245, 213, 71, 0.45); }
    ::highlight(${ACTIVE_NAME}) {
      background-color: rgba(232, 191, 31, 0.7);
      text-decoration: underline 2px rgba(150, 110, 0, 0.9);
    }
    @media (forced-colors: active) {
      ::highlight(${HIGHLIGHT_NAME}), ::highlight(${ACTIVE_NAME}) {
        background-color: Mark;
        color: MarkText;
      }
    }
  `
  ;(document.head ?? document.documentElement).append(style)
}

function locate(item: PaintableHighlight, index: TextIndex): Range | null {
  const selector = item.selector ?? { quote: { exact: item.selectedText } }
  const offsets = anchorSelector(selector, index)
  return offsets ? offsetsToRange(index, offsets.start, offsets.end) : null
}

/** Replaces everything painted with this set. Returns the ids that could not
 * be found on the page as it is now. */
export function paintHighlights(items: PaintableHighlight[]): string[] {
  painted.clear()
  if (!paintingSupported()) return []

  CSS.highlights.delete(HIGHLIGHT_NAME)
  if (items.length === 0) return []

  ensureStyle()
  const index = buildTextIndex(document.body)
  const missing: string[] = []

  for (const item of items) {
    const range = locate(item, index)
    if (range) painted.set(item.id, range)
    else missing.push(item.id)
  }

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...painted.values()))

  return missing
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

/** Scrolls a painted highlight into view and briefly marks it. */
export function scrollToHighlight(id: string): boolean {
  const range = painted.get(id)
  if (!range) return false

  const element =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })

  if (paintingSupported()) {
    CSS.highlights.set(ACTIVE_NAME, new Highlight(range))
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => CSS.highlights.delete(ACTIVE_NAME), 1_800)
  }

  return true
}
