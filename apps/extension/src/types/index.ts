/** A lightweight description of the page the user is currently looking at. */
export interface PageSnapshot {
  url: string
  title: string
  /** Hostname without a leading `www.`, matching the API's `domain`. */
  domain: string
  capturedAt: number
}

/** Readable text pulled out of a page, ready to send to the API. */
export interface ExtractedContent {
  title: string | null
  byline: string | null
  excerpt: string | null
  text: string
  /** The page's own `<link rel="canonical">`, if it declares one. */
  canonicalHint: string | null
}

/** A page as stored by the API. */
export interface PageRecord {
  id: string
  url: string
  canonicalUrl: string
  domain: string
  title: string | null
  contentHash: string | null
  hasContent: boolean
  createdAt: string
  updatedAt: string
}

export interface PageWorkspace {
  page: PageRecord
  counts: {
    conversations: number
    notes: number
    highlights: number
  }
}

/** How far the background worker has got with the current tab. */
export type PageContextStatus =
  | 'idle'
  | 'detecting'
  | 'ready'
  | 'signed-out'
  | 'unsupported'
  | 'error'

/**
 * What the side panel knows about the current tab: always the local snapshot,
 * plus the server-side page once it has been resolved.
 */
export interface PageContext {
  status: PageContextStatus
  snapshot: PageSnapshot | null
  page: PageRecord | null
  error: string | null
}

/** Messages exchanged between the side panel, background worker and content script. */
export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'GET_PAGE_SNAPSHOT' }
  /** Sent by the content script when a single-page app changes route. */
  | { type: 'PAGE_URL_CHANGED'; url: string }

/** Messages the background worker pushes down the side panel's port. */
export type PanelMessage = { type: 'PAGE_CONTEXT'; context: PageContext }

/**
 * Port name the side panel connects with. The background worker watches tabs
 * only while at least one such port is open.
 */
export const PANEL_PORT_NAME = 'webmind-panel'

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

/** Stored chat roles, mirroring the API's MessageRole enum. */
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM'

export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
}

export interface Conversation {
  id: string
  pageId: string
  title: string | null
  messageCount?: number
  createdAt: string
  updatedAt: string
}

export type AiProviderId = 'gemini' | 'openrouter'

/** One selectable answer provider, as reported by GET /ai/status. */
export interface AiProviderSummary {
  id: AiProviderId
  label: string
  /** Usable by this user: the server has a key, or they supplied one. */
  enabled: boolean
  /** Whether the server holds a shared key for it. */
  hasServerKey: boolean
  /** Whether this user has stored their own key for it. */
  hasUserKey: boolean
  models: string[]
  defaultModel: string
}

/** A stored key as the API describes it: identifiable, never usable. */
export interface ProviderCredentialSummary {
  provider: AiProviderId
  /** Masked tail, e.g. "••••9f2a". */
  hint: string
  createdAt: string
  lastUsedAt: string | null
}

/** What the server can do and what this user's questions will use, so the panel
 * can explain itself rather than failing when the user presses send. */
export interface AiStatus {
  enabled: boolean
  /** Whether the server can store user keys at all (encryption configured). */
  byokAvailable: boolean
  providers: AiProviderSummary[]
  selected: {
    provider: AiProviderId
    model: string
    /** True when answers will spend this user's own quota. */
    usingUserKey: boolean
  } | null
  /** False when no embedding provider is configured; long pages then fall back
   * to truncation instead of similarity retrieval. */
  retrievalAvailable: boolean
}

/** Phase the server reports while preparing an answer. Each is real work; there
 * is no stage for anything the backend does not actually do. */
export type AiStage = 'reading' | 'searching' | 'thinking'

/** Events streamed by POST /conversations/:id/messages. */
export type AiStreamEvent =
  | { type: 'status'; stage: AiStage }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; content: string }
  | { type: 'error'; message: string }
