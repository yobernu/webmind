const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** Chrome's wording when the user closes the consent window. */
const CANCEL_PATTERNS = [
  /did not approve/i,
  /user did not/i,
  /canceled/i,
  /cancelled/i,
  /closed by user/i,
];

/** The user backed out of the provider's consent screen; not a real failure. */
export class SignInCancelledError extends Error {
  constructor() {
    super("Sign-in was cancelled");
    this.name = "SignInCancelledError";
  }
}

export class SignInFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInFailedError";
  }
}

/**
 * chrome.identity only exists inside the packaged extension, so the Vite dev
 * harness must be able to tell that provider sign-in is unavailable.
 */
export function isIdentityAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.identity?.launchWebAuthFlow);
}

/** `https://<extension-id>.chromiumapp.org/` — must be registered with Google. */
export function getRedirectUrl(): string | null {
  return isIdentityAvailable() ? chrome.identity.getRedirectURL() : null;
}

/** URL-safe random string, used as the OpenID Connect nonce. */
export function randomNonce(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildGoogleAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  nonce: string;
  scopes: readonly string[];
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);

  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  // An ID token is all this app needs: it proves who the user is, and the API
  // verifies it offline. Requesting an access token would grant API reach we
  // have no use for.
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", options.scopes.join(" "));
  url.searchParams.set("nonce", options.nonce);
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

/** Reads the `#key=value` fragment Google appends to the redirect URL. */
export function parseFragment(responseUrl: string): URLSearchParams {
  const fragment = responseUrl.slice(responseUrl.indexOf("#") + 1);
  return new URLSearchParams(responseUrl.includes("#") ? fragment : "");
}

/** Decodes a JWT payload without verifying it — the API does the verifying. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isCancellation(message: string): boolean {
  return CANCEL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Runs the Google sign-in window and returns the raw ID token.
 *
 * The token is *not* trusted here: the API verifies its signature and audience.
 * The one check worth doing client-side is the nonce, which proves the token
 * came back from the request this extension just made rather than being
 * injected by something else.
 */
export async function launchGoogleSignIn(options: {
  clientId: string;
  scopes: readonly string[];
}): Promise<string> {
  const redirectUri = getRedirectUrl();

  if (!redirectUri) {
    throw new SignInFailedError(
      "Google sign-in is only available inside the extension.",
    );
  }

  const nonce = randomNonce();
  const authUrl = buildGoogleAuthUrl({ ...options, redirectUri, nonce });

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (isCancellation(message)) throw new SignInCancelledError();
    throw new SignInFailedError(message);
  }

  // Chrome resolves with undefined when the window is dismissed.
  if (!responseUrl) throw new SignInCancelledError();

  const params = parseFragment(responseUrl);
  const error = params.get("error");

  if (error) {
    if (error === "access_denied") throw new SignInCancelledError();
    throw new SignInFailedError(describeGoogleError(error, redirectUri));
  }

  const idToken = params.get("id_token");
  if (!idToken) {
    throw new SignInFailedError("Google did not return an identity token.");
  }

  const payload = decodeJwtPayload(idToken);
  if (!payload || payload.nonce !== nonce) {
    throw new SignInFailedError(
      "The Google response did not match this sign-in request.",
    );
  }

  return idToken;
}

/** Turns Google's terse OAuth error codes into something actionable. */
function describeGoogleError(error: string, redirectUri: string): string {
  if (error === "redirect_uri_mismatch") {
    return `Google rejected the redirect URI. Register ${redirectUri} on the OAuth client.`;
  }

  if (error === "admin_policy_enforced" || error === "org_internal") {
    return "Your Google Workspace policy blocks this app.";
  }

  return `Google returned an error: ${error}`;
}
