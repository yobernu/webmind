import type { PageSnapshot, RuntimeMessage, RuntimeResponse } from '../types'
import { hostnameOf, isRestrictedUrl } from './url'

/** True when running inside the packaged extension rather than a plain dev tab. */
export function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
}

/** Snapshot of the document the caller is running in (used by the content script). */
export function snapshotDocument(doc: Document = document): PageSnapshot {
  return {
    url: doc.location.href,
    title: doc.title,
    domain: hostnameOf(doc.location.href),
    capturedAt: Date.now(),
  }
}

/** Snapshot built from a tab, which is all the panel and worker can see. */
export function snapshotTab(tab: chrome.tabs.Tab): PageSnapshot | null {
  if (!tab.url || isRestrictedUrl(tab.url)) return null

  return {
    url: tab.url,
    title: tab.title ?? tab.url,
    domain: hostnameOf(tab.url),
    capturedAt: Date.now(),
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  if (!isExtensionContext() || !chrome.tabs) return undefined
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

/** Snapshot of the tab the side panel is attached to, or null when unavailable. */
export async function getActivePageSnapshot(): Promise<PageSnapshot | null> {
  const tab = await getActiveTab()
  return tab ? snapshotTab(tab) : null
}

/**
 * Sends a message to the content script of the tab the panel is showing.
 *
 * Tabs that were already open when the extension was installed or updated have
 * no content script, so on the first failure the script is injected and the
 * message retried once. Resolves null when the tab cannot be scripted at all.
 */
export async function sendToActiveTab<T = unknown>(
  message: RuntimeMessage,
): Promise<RuntimeResponse<T> | null> {
  const tab = await getActiveTab()
  if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) return null

  const send = () => chrome.tabs.sendMessage(tab.id!, message) as Promise<RuntimeResponse<T>>

  try {
    return await send()
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      return await send()
    } catch {
      return null
    }
  }
}

/**
 * Brings a page to the front: an open tab in this window showing it, or else a
 * new tab here. Staying in the panel's window matters because the side panel
 * belongs to its window and would not follow a tab elsewhere.
 */
export async function openOrFocusUrl(url: string): Promise<void> {
  if (!isExtensionContext() || !chrome.tabs) {
    globalThis.open?.(url, '_blank')
    return
  }

  const tabs = await chrome.tabs.query({ currentWindow: true })
  const match = tabs.find((tab) => tab.url === url)

  if (match?.id) {
    await chrome.tabs.update(match.id, { active: true })
    return
  }

  await chrome.tabs.create({ url })
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
