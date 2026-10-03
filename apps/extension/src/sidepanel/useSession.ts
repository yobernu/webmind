import { useCallback, useEffect, useState } from "react";
import {
  clearStoredSession,
  fetchAuthProviders,
  fetchCurrentUser,
  login,
  loadStoredSession,
  loginWithGoogle,
  register,
  storeSession,
} from "../api/auth";
import { ApiError } from "../api/client";
import type {
  AuthProviders,
  AuthSession,
  AuthUser,
  SessionStatus,
} from "../types";
import {
  launchGoogleSignIn,
  SignInCancelledError,
  SignInFailedError,
} from "../utils/oauth";

/** What kind of failure the last auth attempt hit, for how it is presented. */
export type AuthErrorKind =
  | "credentials"
  | "service"
  | "provider"
  | "unknown";

/** Assumed until `GET /auth/providers` answers, so no button flashes in. */
export type ProvidersState = "loading" | "ready" | "unreachable";

const NO_PROVIDERS: AuthProviders = {
  google: { enabled: false, clientId: null, scopes: [] },
};

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Message from the last failed auth attempt, cleared on the next one. */
  error: string | null;
  errorKind: AuthErrorKind | null;
  /** True while a sign-in / sign-up request is in flight. */
  pending: boolean;
  /** Sign-in options the API reports; drives which buttons are shown. */
  providers: AuthProviders;
  /** Whether those options have arrived, or the API could not be reached. */
  providersState: ProvidersState;
  /** Asks the API for its sign-in options again, after it was unreachable. */
  retryProviders: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/**
 * Owns the extension's auth state: restores the stored token on mount,
 * validates it against `GET /auth/me`, and exposes the auth actions.
 */
export function useSession(): SessionState {
  const [status, setStatus] = useState<SessionStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [pending, setPending] = useState(false);
  const [providers, setProviders] = useState<AuthProviders>(NO_PROVIDERS);
  const [providersState, setProvidersState] = useState<ProvidersState>("loading");

  /** Fetches the sign-in options. A free-tier API can take a minute to wake,
   * so the sign-in screen shows straight away and waits on this instead. */
  const loadProviders = useCallback(async (signal?: AbortSignal) => {
    try {
      const config = await fetchAuthProviders(signal);
      if (signal?.aborted) return;
      setProviders(config);
      setProvidersState("ready");
    } catch {
      if (!signal?.aborted) setProvidersState("unreachable");
    }
  }, []);

  const retryProviders = useCallback(() => {
    setProvidersState("loading");
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const restore = async () => {
      // Which providers exist is independent of whether this user is signed in,
      // so it is fetched alongside rather than after the session check.
      void loadProviders(controller.signal);

      const stored = await loadStoredSession().catch(() => null);

      if (!stored?.accessToken) {
        if (!cancelled) setStatus("signed-out");
        return;
      }

      try {
        // Trust the stored user only after the token itself checks out.
        const current = await fetchCurrentUser(controller.signal);
        if (cancelled) return;
        setUser(current);
        setStatus("signed-in");
      } catch (cause) {
        if (cancelled) return;

        // Only an actual auth rejection invalidates the stored token. An API
        // that is down or whose database is unavailable must not sign the user
        // out — otherwise a backend outage silently logs everyone off.
        const rejected = cause instanceof ApiError && cause.isBadCredentials;

        if (!rejected) {
          setUser(stored.user);
          setStatus("signed-in");
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Could not verify your session",
          );
          setErrorKind("service");
          return;
        }

        await clearStoredSession();
        if (!cancelled) setStatus("signed-out");
      }
    };

    void restore();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadProviders]);

  /** Shared tail of every sign-in route: store the session, or explain why not. */
  const authenticate = useCallback(
    async (produceSession: () => Promise<AuthSession>) => {
      setPending(true);
      setError(null);
      setErrorKind(null);

      try {
        const session = await produceSession();
        await storeSession(session);
        setUser(session.user);
        setStatus("signed-in");
      } catch (cause) {
        // Closing the Google window is a decision, not an error.
        if (cause instanceof SignInCancelledError) {
          return;
        }

        if (cause instanceof ApiError) {
          setError(cause.message);
          setErrorKind(
            cause.isServiceFault
              ? "service"
              : cause.isBadCredentials
                ? "credentials"
                : "unknown",
          );
          return;
        }

        if (cause instanceof SignInFailedError) {
          setError(cause.message);
          setErrorKind("provider");
          return;
        }

        setError("Something went wrong. Please try again.");
        setErrorKind("unknown");
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    (email: string, password: string) =>
      authenticate(() => login({ email: email.trim(), password })),
    [authenticate],
  );

  const signUp = useCallback(
    (email: string, password: string) =>
      authenticate(() => register({ email: email.trim(), password })),
    [authenticate],
  );

  const signInWithGoogle = useCallback(() => {
    const { enabled, clientId, scopes } = providers.google;

    if (!enabled || !clientId) {
      setError("Google sign-in is not available.");
      setErrorKind("provider");
      return Promise.resolve();
    }

    return authenticate(async () => {
      const idToken = await launchGoogleSignIn({ clientId, scopes });
      return loginWithGoogle(idToken);
    });
  }, [authenticate, providers]);

  const signOut = useCallback(async () => {
    await clearStoredSession();
    setUser(null);
    setError(null);
    setErrorKind(null);
    setStatus("signed-out");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorKind(null);
  }, []);

  return {
    status,
    user,
    error,
    errorKind,
    pending,
    providers,
    providersState,
    retryProviders,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    clearError,
  };
}
