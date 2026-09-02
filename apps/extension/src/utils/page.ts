import type { PageSnapshot } from '../types'
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
    hostname: hostnameOf(doc.location.href),
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
  if (!tab?.url || isRestrictedUrl(tab.url)) return null
  return {
    url: tab.url,
    title: tab.title ?? tab.url,
    hostname: hostnameOf(tab.url),
    capturedAt: Date.now(),
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
