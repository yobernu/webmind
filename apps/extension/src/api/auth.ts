import { STORAGE_KEYS } from "../config";
import type { AuthProviders, AuthSession, AuthUser } from "../types";
import { readStored, removeStored, writeStored } from "../utils/storage";
import { apiFetch } from "./client";

interface Credentials {
  email: string;
  password: string;
}

/** POST /auth/register — creates the account and returns a signed-in session. */
export function register(credentials: Credentials): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/register", {
    method: "POST",
    body: credentials,
    auth: false,
  });
}

/** POST /auth/login */
export function login(credentials: Credentials): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/login", {
    method: "POST",
    body: credentials,
    auth: false,
  });
}

/** POST /auth/google — trades a Google ID token for a WebMind session. */
export function loginWithGoogle(idToken: string): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/google", {
    method: "POST",
    body: { idToken },
    auth: false,
  });
}

/** GET /auth/providers — which sign-in options this API offers, and the client id. */
export function fetchAuthProviders(
  signal?: AbortSignal,
): Promise<AuthProviders> {
  return apiFetch<AuthProviders>("/auth/providers", { auth: false, signal });
}

/** GET /auth/me — also serves as the stored-token validity check on boot. */
export function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me", { signal });
}

/** DELETE /users/me — removes the account and everything saved under it. */
export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/users/me", { method: "DELETE" });
}

export function loadStoredSession(): Promise<AuthSession | null> {
  return readStored<AuthSession>(STORAGE_KEYS.session);
}

export function storeSession(session: AuthSession): Promise<void> {
  return writeStored(STORAGE_KEYS.session, session);
}

export function clearStoredSession(): Promise<void> {
  return removeStored(STORAGE_KEYS.session);
}
