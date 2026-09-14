import { loadStoredSession } from '../api/auth'
import { ApiError } from '../api/client'
import { resolvePage, uploadPageContent } from '../api/pages'
import {
  PANEL_PORT_NAME,
  type ExtractedContent,
  type PageContext,
  type PageSnapshot,
  type PanelMessage,
  type RuntimeMessage,
  type RuntimeResponse,
} from '../types'
import { hashContent } from '../utils/hash'
import { snapshotTab } from '../utils/page'
import { isRestrictedUrl } from '../utils/url'

// Clicking the toolbar icon opens the side panel (the manifest declares no popup).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => console.error('[WebMind] setPanelBehavior failed', error))

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[WebMind] service worker installed (${reason})`)
})

/**
 * Open side panel ports. Pages are only ever recorded while one of these is
 * connected, which is what keeps ordinary browsing off the server: no panel,
 * no listeners, no requests.
 */
const panels = new Set<chrome.runtime.Port>()

let current: PageContext = {
  status: 'idle',
  snapshot: null,
  page: null,
  error: null,
}

/** Guards against an older resolve finishing after a newer one. */
let generation = 0

function publish(context: PageContext): void {
  current = context
  const message: PanelMessage = { type: 'PAGE_CONTEXT', context }

  for (const port of panels) {
    try {
      port.postMessage(message)
    } catch {
      // The panel closed between our check and the post.
      panels.delete(port)
    }
  }
}

/** Runs the Readability bundle in the tab and calls it, in two steps. */
async function extractContent(tabId: number): Promise<ExtractedContent | null> {
  try {
    // A bundled IIFE has no usable completion value, so the file is injected
    // first to define the global, then invoked for its return value.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['extract.js'],
    })

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__webmindExtractReadable?.() ?? null,
    })

    return (result?.result as ExtractedContent | null) ?? null
  } catch (error) {
    // Injection is refused on the Chrome Web Store, PDFs and other special
    // pages. Metadata is still worth recording.
    console.warn('[WebMind] content extraction unavailable', error)
    return null
  }
}

async function syncPage(snapshot: PageSnapshot, tabId: number): Promise<void> {
  const mine = ++generation
  const stale = () => mine !== generation

  const session = await loadStoredSession().catch(() => null)

  if (!session?.accessToken) {
    // Signed out: show the page locally, store nothing.
    publish({ status: 'signed-out', snapshot, page: null, error: null })
    return
  }

  // Re-detecting the page we are already showing must not blank it. Reporting
  // `page: null` here discards known-good state, which flickers the workspace
  // and — because the panel keys the chat by page id — would unmount an
  // in-flight answer. Any title change on the active tab triggers this path.
  const samePage = current.snapshot?.url === snapshot.url ? current.page : null

  publish({ status: 'detecting', snapshot, page: samePage, error: null })

  const extracted = await extractContent(tabId)
  if (stale()) return

  const contentHash = extracted?.text
    ? await hashContent(extracted.text)
    : undefined
  if (stale()) return

  try {
    const { page, needsContent } = await resolvePage({
      url: snapshot.url,
      title: extracted?.title ?? snapshot.title,
      canonicalHint: extracted?.canonicalHint ?? undefined,
      contentHash,
    })

    if (stale()) return
    publish({ status: 'ready', snapshot, page, error: null })

    // Upload the body only when the API says it does not already have it.
    if (needsContent && extracted?.text && contentHash) {
      const updated = await uploadPageContent(
        page.id,
        extracted.text,
        contentHash,
      )
      if (stale()) return
      publish({ status: 'ready', snapshot, page: updated, error: null })
    }
  } catch (error) {
    if (stale()) return

    const signedOut = error instanceof ApiError && error.isBadCredentials

    publish({
      status: signedOut ? 'signed-out' : 'error',
      snapshot,
      page: null,
      error:
        error instanceof ApiError ? error.message : 'Could not reach WebMind',
    })
  }
}

async function refreshFromTab(tab?: chrome.tabs.Tab): Promise<void> {
  if (panels.size === 0) return

  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]

  if (!active?.id) {
    publish({ status: 'idle', snapshot: null, page: null, error: null })
    return
  }

  const snapshot = snapshotTab(active)

  if (!snapshot) {
    // chrome://, the Web Store, local files: nothing to record.
    generation += 1
    publish({ status: 'unsupported', snapshot: null, page: null, error: null })
    return
  }

  await syncPage(snapshot, active.id)
}

function onTabActivated(): void {
  void refreshFromTab()
}

function onTabUpdated(
  _tabId: number,
  change: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
): void {
  // `status: 'complete'` marks a finished load; a title arriving later is also
  // worth picking up, but a bare favicon change is not.
  if (!tab.active) return
  if (change.status !== 'complete' && change.title === undefined) return

  void refreshFromTab(tab)
}

/** Tab listeners exist only while a panel is open. */
function startWatching(): void {
  if (chrome.tabs.onActivated.hasListener(onTabActivated)) return

  chrome.tabs.onActivated.addListener(onTabActivated)
  chrome.tabs.onUpdated.addListener(onTabUpdated)
}

function stopWatching(): void {
  chrome.tabs.onActivated.removeListener(onTabActivated)
  chrome.tabs.onUpdated.removeListener(onTabUpdated)
  generation += 1
  current = { status: 'idle', snapshot: null, page: null, error: null }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return

  panels.add(port)
  startWatching()

  // Hand the newcomer whatever is already known, then refresh.
  port.postMessage({ type: 'PAGE_CONTEXT', context: current } satisfies PanelMessage)
  void refreshFromTab()

  port.onDisconnect.addListener(() => {
    panels.delete(port)
    if (panels.size === 0) stopWatching()
  })
})

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender,
    respond: (response: RuntimeResponse) => void,
  ) => {
    if (message?.type === 'PING') {
      respond({ ok: true, data: { version: chrome.runtime.getManifest().version } })
      return true
    }

    // A single-page app navigated. Only the active tab matters, and only while
    // a panel is watching. `sender.tab` is a snapshot that can still carry the
    // pre-navigation URL, so the active tab is re-queried instead.
    if (message?.type === 'PAGE_URL_CHANGED') {
      if (panels.size > 0 && sender.tab?.active && !isRestrictedUrl(message.url)) {
        void refreshFromTab()
      }
      return false
    }

    return false
  },
)
