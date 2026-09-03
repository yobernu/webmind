import { useState, type FormEvent } from "react";
import { API_BASE_URL } from "../../config";
import { getRedirectUrl, isIdentityAvailable } from "../../utils/oauth";
import type { SessionState } from "../useSession";
import GoogleMark from "./GoogleMark";

type Mode = "sign-in" | "sign-up";

/** Minimum enforced by the API's RegisterDto. */
const MIN_PASSWORD_LENGTH = 8;

export default function AuthPanel({ session }: { session: SessionState }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // chrome.identity does not exist in the Vite dev preview, so the button is
  // shown but disabled rather than silently failing.
  const identityAvailable = isIdentityAvailable();
  const googleEnabled = session.providers.google.enabled;
  // Google rejects the flow when this exact string is not registered on the
  // OAuth client, and its error page never tells you what was sent.
  const redirectUrl = getRedirectUrl();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (session.pending) return;

    void (mode === "sign-in"
      ? session.signIn(email, password)
      : session.signUp(email, password));
  };

  const switchMode = () => {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    session.clearError();
  };

  return (
    <form className="auth" onSubmit={submit}>
      <div className="auth-intro">
        <h2>{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h2>
        <p>
          {mode === "sign-in"
            ? "Sign in to sync notes, highlights and conversations across the web."
            : `Continue with Google, or pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`}
        </p>
      </div>

      {googleEnabled && (
        <>
          <button
            type="button"
            className="auth-google"
            onClick={() => void session.signInWithGoogle()}
            disabled={session.pending || !identityAvailable}
            title={
              identityAvailable
                ? undefined
                : "Available only in the installed extension"
            }
          >
            <GoogleMark />
            Continue with Google
          </button>

          {!identityAvailable && (
            <p className="auth-note">
              Google sign-in needs the installed extension — the dev preview has
              no access to chrome.identity.
            </p>
          )}

          <div className="auth-divider">
            <span>or</span>
          </div>
        </>
      )}

      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="you@example.com"
          required
          disabled={session.pending}
        />
      </label>

      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
          required
          disabled={session.pending}
        />
      </label>

      {session.error && (
        <div
          className="auth-error"
          data-kind={session.errorKind ?? "unknown"}
          role="alert"
        >
          <p>{session.error}</p>
          {session.errorKind === "service" && (
            <p className="auth-error-hint">
              The API at {API_BASE_URL} is not responding correctly. This is not
              a problem with your email or password.
            </p>
          )}
          {session.errorKind === "provider" && (
            <p className="auth-error-hint">
              The Google sign-in flow could not complete. Your WebMind password
              still works.
            </p>
          )}
        </div>
      )}

      <button type="submit" className="auth-submit" disabled={session.pending}>
        {session.pending
          ? "Working…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>

      <button type="button" className="auth-switch" onClick={switchMode}>
        {mode === "sign-in"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </button>

      <p className="auth-endpoint">{API_BASE_URL}</p>

      {googleEnabled && redirectUrl && (
        <details className="auth-setup">
          <summary>Google setup</summary>
          <p>Register this as an authorized redirect URI:</p>
          <code>{redirectUrl}</code>
        </details>
      )}
    </form>
  );
}
