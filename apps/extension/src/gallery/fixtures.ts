import type { AiState } from "../sidepanel/useAi";
import type { SessionState } from "../sidepanel/useSession";
import type { WorkspaceState } from "../sidepanel/useWorkspace";
import type { AiStatus, AuthUser, ChatMessage, Conversation, Highlight, Note, PageContext, PageSnapshot, SearchResult } from "../types";

/** Deliberately messy content: real pages are not lorem ipsum. */
export const LONG_QUOTE =
  "The fetch() method of the Window interface starts the process of fetching a resource from the network, returning a promise that is fulfilled once the response is available. The promise resolves to the Response object representing the response to your request. A fetch() promise only rejects when the request fails, for example, because of a badly-formed request URL or a network error. A fetch() promise does not reject if the server responds with HTTP status codes that indicate errors (404, 504, etc.). Instead, a then() handler must check the Response.ok and/or Response.status properties.";

export const LONG_URL =
  "https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch?utm_source=newsletter&utm_medium=email&ref=some-really-long-tracking-reference-0000";

export const RTL_TEXT = "تُرجِع الدالة وعدًا يُحَلّ عندما تصبح الاستجابة متاحة.";

export const CODE_ANSWER = [
  "fetch() only rejects on a **network failure**. A 404 or 500 is still a response, so the promise resolves.",
  "",
  "Check `response.ok` before reading the body:",
  "",
  "```js",
  "const res = await fetch(url)",
  "if (!res.ok) throw new Error(`HTTP ${res.status}`)",
  "```",
  "",
  "- `ok` is true for statuses 200–299",
  "- `status` holds the code itself",
].join("\n");

export const noop = () => {};
export const now = Date.now();
export const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

export const USER: AuthUser = { id: "u1", email: "ada@example.com", name: "Ada Lovelace" };

export const SNAPSHOT: PageSnapshot = {
  url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch",
  title: "Window: fetch() method - Web APIs | MDN",
  domain: "developer.mozilla.org",
  capturedAt: now,
};

export const PAGE = {
  id: "page-1",
  url: SNAPSHOT.url,
  canonicalUrl: SNAPSHOT.url,
  domain: SNAPSHOT.domain,
  title: SNAPSHOT.title,
  contentHash: "abc",
  hasContent: true,
  createdAt: iso(3000),
  updatedAt: iso(5),
};

export const READY: PageContext = { status: "ready", snapshot: SNAPSHOT, page: PAGE, error: null };

export const AI_STATUS: AiStatus = {
  enabled: true,
  byokAvailable: true,
  providers: [
    { id: "anthropic", label: "Anthropic Claude", enabled: true, hasServerKey: true, hasUserKey: false, models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], defaultModel: "claude-opus-5-5" },
    { id: "gemini", label: "Google Gemini", enabled: true, hasServerKey: false, hasUserKey: true, models: ["gemini-3.8-flash"], defaultModel: "gemini-3.8-flash" },
    { id: "openrouter", label: "OpenRouter", enabled: false, hasServerKey: false, hasUserKey: false, models: ["openai/gpt-5.2"], defaultModel: "openai/gpt-5.2" },
  ],
  selected: { provider: "anthropic", model: "claude-opus-5-5", usingUserKey: false },
  retrievalAvailable: true,
};

export const AI: AiState = {
  status: AI_STATUS,
  credentials: [{ provider: "gemini", hint: "••••9f2a", createdAt: iso(9000), lastUsedAt: iso(60) }],
  refresh: async () => {},
  chooseProvider: async () => {},
};

export const CONVERSATIONS: Conversation[] = [
  { id: "c1", pageId: "page-1", title: "Why doesn’t fetch reject on a 404?", messageCount: 4, createdAt: iso(40), updatedAt: iso(5) },
  { id: "c2", pageId: "page-1", title: "AbortController with timeouts", messageCount: 2, createdAt: iso(3000), updatedAt: iso(2900) },
];

export const MESSAGES: ChatMessage[] = [
  { id: "m1", conversationId: "c1", role: "USER", content: "“A fetch() promise does not reject if the server responds with HTTP status codes that indicate errors (404, 504, etc.).”\n\nWhy doesn’t fetch reject on a 404?", createdAt: iso(6) },
  { id: "m2", conversationId: "c1", role: "ASSISTANT", content: CODE_ANSWER, createdAt: iso(6) },
  { id: "m3", conversationId: "c1", role: "USER", content: "And for a timeout?", createdAt: iso(5) },
  { id: "m4", conversationId: "c1", role: "ASSISTANT", content: "Pass an AbortSignal: AbortSignal.timeout(5000) rejects the promise with a TimeoutError once five seconds pass, and the request is", incomplete: true, createdAt: iso(5) },
];

export const NOTES: Note[] = [
  { id: "n1", pageId: "page-1", content: "A 404 still resolves. Check res.ok, not just the catch — our retry wrapper is wrong about this.", sourceText: "A fetch() promise does not reject if the server responds with HTTP status codes that indicate errors", createdAt: iso(50), updatedAt: iso(12) },
  { id: "n2", pageId: "page-1", content: "Ask the team whether we polyfill AbortSignal.timeout for the Safari 15 users.\n\nFollow up Monday.", sourceText: null, createdAt: iso(2000), updatedAt: iso(2000) },
  { id: "local-1", pageId: "page-1", content: "Saving this one right now…", sourceText: null, createdAt: iso(0), updatedAt: iso(0) },
];

export const HIGHLIGHTS: Highlight[] = [
  { id: "h1", pageId: "page-1", selectedText: "returning a promise that is fulfilled once the response is available", selector: null, createdAt: iso(55) },
  { id: "h2", pageId: "page-1", selectedText: LONG_QUOTE, selector: null, createdAt: iso(52) },
  { id: "h3", pageId: "page-1", selectedText: "This paragraph was rewritten after you highlighted it.", selector: null, createdAt: iso(4000) },
];

export const WORKSPACE: WorkspaceState = {
  loading: false,
  error: null,
  notes: NOTES,
  highlights: HIGHLIGHTS,
  conversations: CONVERSATIONS,
  counts: { conversations: 2, notes: 3, highlights: 3 },
  lastActivityAt: iso(5),
  refresh: async () => {},
  addNote: async () => true,
  updateNote: async () => true,
  deleteNote: async () => true,
  addHighlight: async () => null,
  deleteHighlight: async () => true,
  dismissError: noop,
};

export const EMPTY_WORKSPACE: WorkspaceState = {
  ...WORKSPACE,
  notes: [],
  highlights: [],
  conversations: [],
  counts: { conversations: 0, notes: 0, highlights: 0 },
  lastActivityAt: null,
};

export const SEARCH_RESULTS: SearchResult[] = [
  { type: "note", id: "n1", snippet: "A 404 still resolves. Check res.ok, not just the \uE000catch\uE001 — our retry wrapper", createdAt: iso(12), conversationId: null, page: { id: "page-1", url: SNAPSHOT.url, title: SNAPSHOT.title, domain: SNAPSHOT.domain } },
  { type: "message", id: "m2", snippet: "fetch() only rejects on a network failure. A 404 or 500 is still a response, so the promise resolves. \uE000Catch\uE001 blocks never see HTTP errors", createdAt: iso(6), conversationId: "c1", page: { id: "page-1", url: SNAPSHOT.url, title: SNAPSHOT.title, domain: SNAPSHOT.domain } },
  { type: "highlight", id: "h9", snippet: "Errors thrown inside a promise are \uE000caught\uE001 by the next rejection handler in the chain", createdAt: iso(9000), conversationId: null, page: { id: "page-2", url: "https://javascript.info/promise-error-handling", title: "Error handling with promises", domain: "javascript.info" } },
];

export const SESSION: SessionState = {
  status: "signed-out",
  user: null,
  error: null,
  errorKind: null,
  pending: false,
  providers: { google: { enabled: true, clientId: "x", scopes: [] } },
  providersState: "ready",
  retryProviders: noop,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  clearError: noop,
};
