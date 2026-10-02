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

/** Response of GET /pages/:id/workspace: everything saved against a page. */
export interface PageWorkspace {
  page: PageRecord
  /** Most recently active first, capped; `counts` holds the true totals. */
  conversations: Conversation[]
  notes: Note[]
  highlights: Highlight[]
  counts: {
    conversations: number
    notes: number
    highlights: number
  }
  lastActivityAt: string | null
}

export interface Note {
  id: string
  pageId: string
  content: string
  /** The passage the note was written against, when it came from a selection. */
  sourceText: string | null
  createdAt: string
  updatedAt: string
}

/** Mirrors the W3C Web Annotation quote selector. */
export interface TextQuoteSelector {
  exact: string
  prefix?: string
  suffix?: string
}

/** Character offsets into the page's text content; a hint, not an anchor. */
export interface TextPositionSelector {
  start: number
  end: number
}

export interface HighlightSelector {
  quote: TextQuoteSelector
  position?: TextPositionSelector
}

export interface Highlight {
  id: string
  pageId: string
  selectedText: string
  selector: HighlightSelector | null
  createdAt: string
}

/** A selection captured by the content script, ready to save or ask about. */
export interface CapturedSelection {
  /** What the user saw selected, whitespace tidied. */
  text: string
  selector: HighlightSelector
  url: string
}

/** The buttons of the in-page selection toolbar. */
export type SelectionAction = 'highlight' | 'ask' | 'note'

/** What the panel asks the content script to paint. */
export interface PaintableHighlight {
  id: string
  selector: HighlightSelector | null
  selectedText: string
}

export type SearchResultType = 'note' | 'message' | 'highlight'

/** One hit from GET /search. */
export interface SearchResult {
  type: SearchResultType
  id: string
  /** Matched text, each hit wrapped in U+E000 … U+E001 (private-use
   * characters, so ordinary text can never be mistaken for a marker). */
  snippet: string
  createdAt: string
  /** Set for message hits, so the conversation can be reopened. */
  conversationId: string | null
  page: {
    id: string
    url: string
    title: string | null
    domain: string
  }
}

/** How far the background worker has got with the current tab. */
export type PageContextStatus =
  | 'idle'
  | 'detecting'
  | 'ready'
  | 'signed-out'
  /** Signed in, but the privacy explanation has not been acknowledged yet, so
   * nothing about the page is sent. */
  | 'consent-required'
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
  /** Content script asking whether a side panel is watching its tab; only an
   * open panel in the same window answers. */
  | { type: 'PANEL_PING' }
  /** A selection toolbar button was pressed (content script → side panel). */
  | { type: 'SELECTION_ACTION'; action: SelectionAction; selection: CapturedSelection }
  /** Side panel → content script: re-anchor and paint these highlights,
   * replacing whatever was painted before. Answers with the ids not found. */
  | { type: 'PAINT_HIGHLIGHTS'; highlights: PaintableHighlight[] }
  /** Side panel → content script. */
  | { type: 'SCROLL_TO_HIGHLIGHT'; id: string }

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

/**
 * A one-shot request for a tab to do something on arrival: prefill the
 * composer from a selection, or open an item picked from history or search.
 * Items carry their page id because picking a search result can switch pages;
 * the intent waits until that page is the one being shown.
 */
export type PanelIntent =
  | { kind: 'ask'; text: string }
  | { kind: 'note'; sourceText: string }
  | { kind: 'open-conversation'; pageId: string; conversationId: string }
  | { kind: 'focus-note'; pageId: string; noteId: string }
  | { kind: 'focus-highlight'; pageId: string; highlightId: string }

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
  /** An answer cut short by a failure, a timeout or Stop. */
  incomplete?: boolean
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

export type AiProviderId = 'gemini' | 'openrouter' | 'anthropic'

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
