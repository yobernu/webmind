import type { PaintableHighlight } from '../types'
import { anchorSelector, buildTextIndex, offsetsToRange, type TextIndex } from '../utils/anchor'

const HIGHLIGHT_NAME = 'webmind'
const ACTIVE_NAME = 'webmind-active'
const STYLE_ID = 'webmind-highlight-style'

/**
 * Paints saved highlights with the CSS Custom Highlight API, which styles
 * ranges without inserting a single element into the page. Wrapping text in
 * <mark> tags would break frameworks that own their DOM and change what the
 * page's own scripts see.
 */
const painted = new Map<string, Range>()

function supported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(255, 213, 79, 0.55); }
    ::highlight(${ACTIVE_NAME}) { background-color: rgba(134, 59, 255, 0.45); }
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
  if (!supported()) return items.map((item) => item.id)

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

  if (supported()) {
    CSS.highlights.set(ACTIVE_NAME, new Highlight(range))
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => CSS.highlights.delete(ACTIVE_NAME), 1_800)
  }

  return true
}
