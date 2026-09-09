/**
 * Must match the API's `normalizeContent`, or the hashes will never agree and
 * the same text would be uploaded on every visit.
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** sha256 hex of normalised text, matching the API's `hashContent`. */
export async function hashContent(text: string): Promise<string> {
  const normalized = normalizeText(text);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
