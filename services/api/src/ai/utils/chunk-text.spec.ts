import { describe, expect, it } from 'vitest';

import { CHUNK_OVERLAP, CHUNK_SIZE, chunkText } from './chunk-text.js';

describe('chunkText', () => {
  it('returns nothing for empty or blank text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('keeps a short page as a single chunk', () => {
    expect(chunkText('A short article body.')).toEqual([
      'A short article body.',
    ]);
  });

  it('normalises whitespace', () => {
    expect(chunkText('Loose   spacing\n\nacross lines.')).toEqual([
      'Loose spacing across lines.',
    ]);
  });

  it('splits long text into several chunks within the size limit', () => {
    const text = 'word '.repeat(2_000);

    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });

  it('does not break mid-word', () => {
    const chunks = chunkText('alpha bravo charlie delta '.repeat(200));

    for (const chunk of chunks) {
      // Every chunk should start and end on a whole word.
      expect(chunk).toMatch(/^(alpha|bravo|charlie|delta)/);
      expect(chunk).toMatch(/(alpha|bravo|charlie|delta)$/);
    }
  });

  it('prefers to break after a sentence', () => {
    const sentence = 'This is a complete sentence about a topic. ';
    const chunks = chunkText(sentence.repeat(100));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endsWith('.')).toBe(true);
  });

  it('overlaps chunks so a boundary-spanning sentence stays findable', () => {
    const chunks = chunkText('word '.repeat(1_000));

    const tail = chunks[0].slice(-Math.floor(CHUNK_OVERLAP / 2));
    expect(chunks[1]).toContain(tail.trim().split(' ').at(-1) ?? '');
  });

  it('covers the whole input across chunks', () => {
    const text = `START ${'filler '.repeat(1_000)}END`;

    const chunks = chunkText(text);

    expect(chunks[0].startsWith('START')).toBe(true);
    expect(chunks.at(-1)?.endsWith('END')).toBe(true);
  });

  describe('text with no usable word boundaries', () => {
    // A base64 blob, minified script or very long URL. Aligning the overlap to
    // the "next space" can skip a long way here, so the guard against dropping
    // text matters.
    it('loses no text when there are no spaces at all', () => {
      const text = 'x'.repeat(CHUNK_SIZE + 20);

      const chunks = chunkText(text);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('').length).toBeGreaterThanOrEqual(text.length);
    });

    it('keeps a long unbroken token that straddles a boundary', () => {
      const blob = 'A'.repeat(600);
      const text = `${'word '.repeat(260)}${blob} tail marker`;

      const chunks = chunkText(text);

      expect(chunks.some((chunk) => chunk.includes('tail marker'))).toBe(true);
      // The blob itself survives across the chunks that cover it.
      expect(chunks.join('')).toContain('A'.repeat(100));
    });
  });
});
