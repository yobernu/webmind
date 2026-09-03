/** Base URL of the WebMind API. Override with VITE_API_BASE_URL at build time. */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/** Keys used in `chrome.storage.local`. */
export const STORAGE_KEYS = {
  session: "webmind.session",
} as const;
