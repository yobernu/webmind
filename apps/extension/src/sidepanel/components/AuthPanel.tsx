import { useState, type FormEvent } from "react";
import { API_BASE_URL } from "../../config";
import { BrandLockup, Button, InlineAlert, TextButton, TextField } from "../../ui";
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
    void (mode === "sign-in" ? session.signIn(email, password) : session.signUp(email, password));
  };

  const switchMode = () => {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    session.clearError();
  };

  return (
    <div className="auth">
      <BrandLockup height={20} />

      <div className="auth-intro">
        <h1 className="auth-title">{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
        <p className="auth-lede">
          Your questions, notes and highlights stay with each page you read, and come back when you
          return.
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {googleEnabled && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-md auth-google"
              onClick={() => void session.signInWithGoogle()}
              disabled={session.pending || !identityAvailable}
              title={identityAvailable ? undefined : "Available only in the installed extension"}
            >
              <GoogleMark />
              <span>Continue with Google</span>
            </button>
            <div className="auth-divider" role="separator">
              <span>or with email</span>
            </div>
          </>
        )}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="you@example.com"
          required
          disabled={session.pending}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={mode === "sign-up" ? MIN_PASSWORD_LENGTH : undefined}
          hint={mode === "sign-up" ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          required
          disabled={session.pending}
        />

        {session.error && (
          <InlineAlert tone="error">
            <p>{session.error}</p>
            {session.errorKind === "service" && (
              <p>The Gloss AI service isn’t responding. This isn’t a problem with your email or password.</p>
            )}
            {session.errorKind === "provider" && (
              <p>Google sign-in couldn’t finish. Your Gloss AI password still works.</p>
            )}
          </InlineAlert>
        )}

        <Button type="submit" variant="primary" loading={session.pending} className="auth-submit">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="auth-switch">
        {mode === "sign-in" ? "New to Gloss AI? " : "Already have an account? "}
        <TextButton onClick={switchMode}>{mode === "sign-in" ? "Create an account" : "Sign in"}</TextButton>
      </p>

      {import.meta.env.DEV && (
        <div className="auth-dev">
          <p>API: {API_BASE_URL}</p>
          {googleEnabled && redirectUrl && (
            <p>
              Google redirect URI: <code>{redirectUrl}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
