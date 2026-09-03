/** A lightweight description of the page the user is currently looking at. */
export interface PageSnapshot {
  url: string
  title: string
  hostname: string
  capturedAt: number
}

/** Messages exchanged between the side panel, background worker and content script. */
export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'GET_PAGE_SNAPSHOT' }

export interface RuntimeResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export type WorkspaceTab = 'chat' | 'notes' | 'highlights' | 'history'

/** The authenticated account, as returned by `GET /auth/me`. */
export interface AuthUser {
  id: string
  email: string
  /** Supplied by a provider such as Google; null for password accounts. */
  name?: string | null
  avatarUrl?: string | null
}

/** Response of `GET /auth/providers`: which sign-in options the API offers. */
export interface AuthProviders {
  google: {
    enabled: boolean
    clientId: string | null
    scopes: string[]
  }
}

/** Response body of `POST /auth/register` and `POST /auth/login`. */
export interface AuthSession {
  accessToken: string
  user: AuthUser
}

export type SessionStatus = 'restoring' | 'signed-out' | 'signed-in'

/** Stages of the side panel boot sequence that the splash screen reflects. */
export type BootPhase = 'booting' | 'fading' | 'ready'
