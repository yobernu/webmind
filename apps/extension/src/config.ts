/** Base URL of the Gloss AI API. Override with VITE_API_BASE_URL at build time. */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * Keys used in `chrome.storage.local`. They keep the product's original
 * "webmind." prefix on purpose: renaming them would sign everyone out and
 * re-show the privacy notice.
 */
export const STORAGE_KEYS = {
  session: "webmind.session",
  /** Which version of the privacy explanation the user has acknowledged. */
  privacyAck: "webmind.privacyAck",
} as const;

/**
 * Bump when what Gloss AI collects or where it goes changes, so everyone sees
 * the explanation again before any more page content is sent.
 */
export const PRIVACY_NOTICE_VERSION = 1;
