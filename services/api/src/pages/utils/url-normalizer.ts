/**
 * Query parameters that identify a *referral*, not a page. Removing them makes
 * `?utm_source=twitter` and a clean link resolve to the same page.
 *
 * The list is a deliberate denylist rather than an allowlist: unknown
 * parameters are kept, because on search, archive and pagination URLs the query
 * *is* the page identity. Erring this way splits a page in two at worst;
 * erring the other way would merge two unrelated pages into one.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gbraid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'ref_src',
  'ref_url',
  'twclid',
  'wbraid',
  'yclid',
  '_ga',
  '_gl',
]);

/** Prefixes covering whole families of campaign parameters. */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_'];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();

  return (
    TRACKING_PARAMS.has(lower) ||
    TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

export interface CanonicalUrl {
  canonicalUrl: string;
  domain: string;
}

function parse(value: string): URL | null {
  try {
    const url = new URL(value);
    // Only web pages have a canonical identity worth storing.
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Hostname without a leading `www.`, lowercased. Never includes the port. */
export function domainOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

/** Host as it appears in a URL: domain plus port, when there is one. */
function hostOf(url: URL): string {
  const domain = domainOf(url);
  return url.port ? `${domain}:${url.port}` : domain;
}

function normalize(url: URL): CanonicalUrl {
  const domain = domainOf(url);

  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    // Sort so that ?b=2&a=1 and ?a=1&b=2 are one page.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const query = new URLSearchParams(params).toString();

  // Trailing slashes are meaningless for identity, except at the root where
  // removing it would leave an empty path.
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';

  return {
    // The port belongs in the identity (localhost:3000 and localhost:5173 are
    // different pages) but not in `domain`, which is for grouping and display.
    canonicalUrl: `${url.protocol}//${hostOf(url)}${path}${query ? `?${query}` : ''}`,
    domain,
  };
}

/**
 * Reduces a visited URL to the stable identity of the page behind it.
 *
 * `canonicalHint` is the page's own `<link rel="canonical">`. It is trusted
 * only when it names the same host: a cross-origin hint would let any page
 * claim to be another, which on a per-user unique index means writing into the
 * row of a page the user never visited.
 *
 * Returns null when the URL is not a normal web page (bad syntax,
 * `chrome://`, `file://`, and so on).
 */
export function canonicalizeUrl(
  rawUrl: string,
  canonicalHint?: string | null,
): CanonicalUrl | null {
  const visited = parse(rawUrl);
  if (!visited) return null;

  const hint = canonicalHint?.trim();

  // Any text resolves against a base URL — `new URL('not a url', base)` yields
  // `base/not%20a%20url` rather than throwing. Whitespace cannot appear in a
  // real URL reference, so it is the cheap signal that a hint is junk and
  // would otherwise silently redefine the page's identity.
  if (hint && !/\s/.test(hint)) {
    // Hints are often relative ("/article"), so resolve against the visited URL.
    let hinted: URL | null = null;
    try {
      hinted = parse(new URL(hint, visited).toString());
    } catch {
      hinted = null;
    }

    if (hinted && domainOf(hinted) === domainOf(visited)) {
      return normalize(hinted);
    }
  }

  return normalize(visited);
}
