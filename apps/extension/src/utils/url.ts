/** Hostname of a URL, or an empty string when it cannot be parsed. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Pages that extensions are not allowed to read or inject into. */
export function isRestrictedUrl(url: string): boolean {
  return (
    !url ||
    /^(chrome|chrome-extension|edge|about|devtools|view-source|file):/i.test(url) ||
    url.startsWith('https://chromewebstore.google.com')
  )
}

/** Compact, human readable form of a URL for display in the panel header. */
export function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${hostnameOf(url)}${path}`.slice(0, 64)
  } catch {
    return url.slice(0, 64)
  }
}
