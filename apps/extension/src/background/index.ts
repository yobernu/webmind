import type { RuntimeMessage, RuntimeResponse } from '../types'

// Clicking the toolbar icon opens the side panel (the manifest declares no popup).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => console.error('[WebMind] setPanelBehavior failed', error))

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[WebMind] service worker installed (${reason})`)
})

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, respond: (response: RuntimeResponse) => void) => {
    if (message?.type === 'PING') {
      respond({ ok: true, data: { version: chrome.runtime.getManifest().version } })
      return true
    }
    return false
  },
)
