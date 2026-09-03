import { isExtensionContext } from "./page";

/**
 * Thin wrapper over `chrome.storage.local` that falls back to `localStorage`
 * so the Vite dev harness works outside the packaged extension.
 */
export async function readStored<T>(key: string): Promise<T | null> {
  if (isExtensionContext() && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(key);
    return (stored[key] as T | undefined) ?? null;
  }

  const raw = globalThis.localStorage?.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  if (isExtensionContext() && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}

export async function removeStored(key: string): Promise<void> {
  if (isExtensionContext() && chrome.storage?.local) {
    await chrome.storage.local.remove(key);
    return;
  }

  globalThis.localStorage?.removeItem(key);
}
