import type { PageSnapshot, RuntimeMessage, RuntimeResponse } from '../types'
import { snapshotDocument } from '../utils/page'

// Runs on every page, so it stays deliberately small: it answers page-context
// requests and reports route changes. The heavy Readability extractor is
// injected on demand by the background worker instead of living here.

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    respond: (response: RuntimeResponse<PageSnapshot>) => void,
  ) => {
    if (message?.type === 'GET_PAGE_SNAPSHOT') {
      respond({ ok: true, data: snapshotDocument() })
      return true
    }
    return false
  },
)

/**
 * Single-page apps change the URL without a navigation, so `tabs.onUpdated`
 * may never fire. Patching the history API catches those transitions without
 * needing the broad `webNavigation` permission.
 */
function reportUrlChange(): void {
  chrome.runtime
    .sendMessage({ type: 'PAGE_URL_CHANGED', url: location.href })
    // The worker may be asleep or the panel closed; nothing to do about it.
    .catch(() => {})
}

let lastReportedUrl = location.href

function reportIfChanged(): void {
  if (location.href === lastReportedUrl) return
  lastReportedUrl = location.href
  reportUrlChange()
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
