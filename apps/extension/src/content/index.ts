import type {
  CapturedSelection,
  PageSnapshot,
  RuntimeMessage,
  RuntimeResponse,
  SelectionAction,
} from '../types'
import { buildTextIndex, describeRange } from '../utils/anchor'
import { snapshotDocument } from '../utils/page'
import { paintHighlights, scrollToHighlight } from './highlighter'
import { createSelectionToolbar, type SelectionToolbar } from './toolbar'

// Runs on every page, so it stays deliberately small: it answers page-context
// requests, reports route changes, offers the selection toolbar while a panel
// is open, and paints highlights the panel sends. The heavy Readability
// extractor is injected on demand by the background worker instead.

declare global {
  interface Window {
    __webmindContentLoaded?: boolean
  }
}

/** Shortest selection worth offering actions for. */
const MIN_SELECTION_LENGTH = 2

/** After an extension reload, scripts already in open tabs are orphaned and
 * every chrome.runtime call throws. */
function extensionAlive(): boolean {
  return Boolean(chrome.runtime?.id)
}

function main(): void {
  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, _sender, respond: (response: RuntimeResponse) => void) => {
      switch (message?.type) {
        case 'GET_PAGE_SNAPSHOT':
          respond({ ok: true, data: snapshotDocument() satisfies PageSnapshot })
          return false
        case 'PAINT_HIGHLIGHTS':
          respond({ ok: true, data: { missing: paintHighlights(message.highlights) } })
          return false
        case 'SCROLL_TO_HIGHLIGHT':
          respond({ ok: scrollToHighlight(message.id) })
          return false
        default:
          return false
      }
    },
  )

  watchRouteChanges()
  watchSelections()
}

/**
 * Single-page apps change the URL without a navigation, so `tabs.onUpdated`
 * may never fire. Patching the history API catches those transitions without
 * needing the broad `webNavigation` permission.
 */
function watchRouteChanges(): void {
  let lastReportedUrl = location.href

  const reportIfChanged = () => {
    if (location.href === lastReportedUrl || !extensionAlive()) return
    lastReportedUrl = location.href
    chrome.runtime
      .sendMessage({ type: 'PAGE_URL_CHANGED', url: location.href } satisfies RuntimeMessage)
      // The worker may be asleep or the panel closed; nothing to do about it.
      .catch(() => {})
  }

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]

    history[method] = function patched(
      this: History,
      ...args: Parameters<History['pushState']>
    ) {
      const result = original.apply(this, args)
      // The URL updates synchronously, but frameworks render just after; a
      // microtask is enough to read the new location without racing them.
      queueMicrotask(reportIfChanged)
      return result
    }
  }

  addEventListener('popstate', reportIfChanged)
  addEventListener('hashchange', reportIfChanged)
}

/** Only an open side panel in this window answers, so the toolbar never
 * appears during ordinary browsing. */
async function panelIsWatching(): Promise<boolean> {
  if (!extensionAlive()) return false
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: 'PANEL_PING',
    } satisfies RuntimeMessage)) as RuntimeResponse | undefined
    return reply?.ok === true
  } catch {
    return false
  }
}

/** Selections inside form fields are the user typing, not reading. */
function isEditable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement
  return Boolean(element?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'))
}

function currentRange(): Range | null {
  const selection = getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  if (selection.toString().trim().length < MIN_SELECTION_LENGTH) return null

  const range = selection.getRangeAt(0)
  return isEditable(range.commonAncestorContainer) ? null : range
}

function capture(range: Range): CapturedSelection | null {
  const selector = describeRange(range, buildTextIndex(document.body))
  if (!selector) return null

  return {
    text: range.toString().replace(/\s+/g, ' ').trim(),
    selector,
    url: location.href,
  }
}

function watchSelections(): void {
  let toolbar: SelectionToolbar | null = null
  // Ignores a ping that returns after the selection already changed.
  let attempt = 0

  const onAction = (action: SelectionAction) => {
    const range = currentRange()
    toolbar?.hide()
    if (!range || !extensionAlive()) return

    const selection = capture(range)
    if (!selection) return

    chrome.runtime
      .sendMessage({ type: 'SELECTION_ACTION', action, selection } satisfies RuntimeMessage)
      .catch(() => {})

    // The highlight paints over the text; a lingering selection would hide it.
    if (action === 'highlight') getSelection()?.removeAllRanges()
  }

  const update = async (event: Event) => {
    if (toolbar?.contains(event.target)) return

    const mine = ++attempt
    // Let the browser finish updating the selection for this event.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const range = currentRange()
    if (!range) {
      toolbar?.hide()
      return
    }

    if (!(await panelIsWatching()) || mine !== attempt) return
    // The selection may have changed while the panel answered.
    if (!currentRange()) return

    toolbar ??= createSelectionToolbar(onAction)
    toolbar.show(range.getBoundingClientRect())
  }

  document.addEventListener('mouseup', (event) => void update(event))
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') {
      attempt += 1
      toolbar?.hide()
      return
    }
    // Keyboard selection: Shift with arrows, Home/End, or select-all.
    if (event.shiftKey || event.key === 'a') void update(event)
  })
  document.addEventListener('mousedown', (event) => {
    if (!toolbar?.contains(event.target)) toolbar?.hide()
  })
}

// The panel injects this file into tabs opened before the extension was
// installed; a guard keeps a second copy from doubling every listener.
if (!window.__webmindContentLoaded) {
  window.__webmindContentLoaded = true
  main()
}
