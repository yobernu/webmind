import { createHash } from 'node:crypto';

/**
 * Collapses runs of whitespace and trims, so that cosmetic reflowing of the
 * same article does not read as a content change.
 */
export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Content address of extracted page text. The extension sends this so the API
 * can answer "do I already have this?" without transferring the body.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(normalizeContent(content), 'utf8').digest('hex');
}
