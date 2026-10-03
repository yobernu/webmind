import { API_BASE_URL } from "../../config";
import { BrandMark, Button, InlineAlert, Spinner, Wordmark } from "../../ui";
import { getRedirectUrl, isIdentityAvailable } from "../../utils/oauth";
import type { SessionState } from "../useSession";
import GoogleMark from "./GoogleMark";

/**
 * Sign-in is Google only for now. The same button signs in a returning
 * reader and creates an account for a new one, so there is one screen.
 */
export default function AuthPanel({ session }: { session: SessionState }) {
  // chrome.identity does not exist in the Vite dev preview.
  const identityAvailable = isIdentityAvailable();
  // Google rejects the flow when this exact string is not registered on the
  // OAuth client, and its error page never tells you what was sent.
  const redirectUrl = getRedirectUrl();

  const { providersState } = session;
  const connecting = providersState === "loading";
  const unreachable = providersState === "unreachable";
  const notConfigured = providersState === "ready" && !session.providers.google.enabled;
  const canSignIn = providersState === "ready" && !notConfigured && identityAvailable;

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark size={52} />
          <Wordmark height={24} />
        </div>

        <h1 className="auth-title">
          Your notes, kept with <span className="auth-title-mark">the page</span>
        </h1>
        <p className="auth-lede">
          Ask about what you’re reading, highlight what matters, and find it all again when you come back.
        </p>

        <button
          type="button"
          className="google-btn"
          onClick={() => void session.signInWithGoogle()}
          disabled={!canSignIn || session.pending}
          aria-busy={session.pending || connecting || undefined}
        >
          {session.pending || connecting ? <Spinner size={16} /> : <GoogleMark size={18} />}
          <span>{session.pending ? "Signing in…" : connecting ? "Connecting…" : "Continue with Google"}</span>
        </button>

        {!unreachable && !notConfigured && !session.error && (
          <p className="auth-hint">New to Gloss AI? Continuing creates your account.</p>
        )}

        {unreachable && (
          <InlineAlert
            tone="error"
            action={
              <Button size="sm" variant="ghost" icon="retry" onClick={session.retryProviders}>
                Retry
              </Button>
            }
          >
            <p>Gloss AI isn’t reachable right now.</p>
          </InlineAlert>
        )}

        {notConfigured && (
          <InlineAlert tone="warning">
            <p>Google sign-in isn’t set up on this server yet.</p>
          </InlineAlert>
        )}

        {!identityAvailable && providersState === "ready" && !notConfigured && (
          <p className="auth-hint">Google sign-in works in the installed extension, not this preview.</p>
        )}

        {session.error && (
          <InlineAlert tone="error">
            <p>{session.error}</p>
            {session.errorKind === "service" && (
              <p>The Gloss AI service isn’t responding. Try again in a moment.</p>
            )}
          </InlineAlert>
        )}
      </div>

      <p className="auth-foot">Gloss reads a page only while this panel is open.</p>

      {import.meta.env.DEV && (
        <div className="auth-dev">
          <p>API: {API_BASE_URL}</p>
          {redirectUrl && (
            <p>
              Google redirect URI: <code>{redirectUrl}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
