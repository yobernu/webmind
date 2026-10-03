/** Hostname of a URL, or an empty string when it cannot be parsed. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Stores and account pages where browsers refuse to run extensions. */
const PROTECTED_HOSTS = [
  'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
  'https://addons.mozilla.org',
  'https://accounts-static.cdn.mozilla.net',
]

/** Pages that extensions are not allowed to read or inject into, in Chrome
 * and Firefox. */
export function isRestrictedUrl(url: string): boolean {
  return (
    !url ||
    /^(chrome|chrome-extension|chrome-untrusted|edge|about|devtools|view-source|file|moz-extension|resource|data|blob|javascript):/i.test(
      url,
    ) ||
    PROTECTED_HOSTS.some((host) => url.startsWith(host))
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
