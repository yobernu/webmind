import { Readability } from '@mozilla/readability'

import type { ExtractedContent } from '../types'

/**
 * Injected into a page on demand by the background worker, never bundled into
 * the always-on content script: Readability is far too large to load into
 * every page the user browses.
 *
 * Defines a global rather than returning a value, because a bundled IIFE has
 * no usable completion value for `executeScript`. The background worker calls
 * the global in a second `executeScript`.
 */

const MAX_TEXT_LENGTH = 200_000

/**
 * Below this, Readability's answer is not trusted.
 *
 * On app-like pages (dashboards, mail, feeds) Readability does not fail
 * cleanly — it returns a short scrape that includes navigation and controls.
 * A length floor is what actually distinguishes "found an article" from "found
 * whatever was lying around", and under it the main-container fallback gives
 * cleaner text.
 */
const MIN_READABLE_LENGTH = 200

function canonicalHint(doc: Document): string | null {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  const href = link?.getAttribute('href')?.trim()

  return href && href.length > 0 ? href : null
}

/** Whitespace-normalised text of the best content container we can find. */
function fallbackText(doc: Document): string {
  const container =
    doc.querySelector('article') ??
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.body

  return (container?.innerText ?? '').replace(/\s+/g, ' ').trim()
}

function extract(): ExtractedContent {
  const hint = canonicalHint(document)

  let parsed: ReturnType<Readability['parse']> = null
  try {
    // Readability mutates the document it parses, so it gets a clone.
    parsed = new Readability(document.cloneNode(true) as Document).parse()
  } catch {
    parsed = null
  }

  const readableText = parsed?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

  const text =
    readableText.length >= MIN_READABLE_LENGTH
      ? readableText
      : fallbackText(document)

  return {
    title: parsed?.title?.trim() || document.title || null,
    byline: parsed?.byline?.trim() || null,
    excerpt: parsed?.excerpt?.trim() || null,
    text: text.slice(0, MAX_TEXT_LENGTH),
    canonicalHint: hint,
  }
}

declare global {
  interface Window {
    __webmindExtractReadable?: () => ExtractedContent
  }
}

window.__webmindExtractReadable = extract
