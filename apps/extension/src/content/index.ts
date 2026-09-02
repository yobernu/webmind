import type { PageSnapshot, RuntimeMessage, RuntimeResponse } from '../types'
import { snapshotDocument } from '../utils/page'

// Runs on every page; answers page-context requests from the side panel.
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
