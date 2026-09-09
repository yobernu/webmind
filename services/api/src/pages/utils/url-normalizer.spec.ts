import { describe, expect, it } from 'vitest';

import { canonicalizeUrl } from './url-normalizer.js';

const canonical = (url: string, hint?: string) =>
  canonicalizeUrl(url, hint)?.canonicalUrl;

describe('canonicalizeUrl', () => {
  it('keeps a already-clean URL intact', () => {
    expect(canonical('https://example.com/article')).toBe(
      'https://example.com/article',
    );
  });

  it('reports the domain without www', () => {
    expect(canonicalizeUrl('https://www.example.com/a')?.domain).toBe(
      'example.com',
    );
  });

  it('treats www and non-www as the same page', () => {
    expect(canonical('https://www.example.com/article')).toBe(
      canonical('https://example.com/article'),
    );
  });

  it('drops the fragment', () => {
    expect(canonical('https://example.com/article#section-2')).toBe(
      'https://example.com/article',
    );
  });

  it('drops campaign and click-id parameters', () => {
    expect(
      canonical(
        'https://example.com/article?utm_source=x&utm_medium=social&fbclid=abc&gclid=def',
      ),
    ).toBe('https://example.com/article');
  });

  it('keeps parameters that identify the page', () => {
    expect(canonical('https://example.com/search?q=prisma&page=2')).toBe(
      'https://example.com/search?page=2&q=prisma',
    );
  });

  it('orders parameters so argument order does not create two pages', () => {
    expect(canonical('https://example.com/s?b=2&a=1')).toBe(
      canonical('https://example.com/s?a=1&b=2'),
    );
  });

  it('trims a trailing slash but keeps the root path', () => {
    expect(canonical('https://example.com/article/')).toBe(
      'https://example.com/article',
    );
    expect(canonical('https://example.com/')).toBe('https://example.com/');
  });

  it('lowercases the host but preserves path case', () => {
    expect(canonical('https://EXAMPLE.com/Article')).toBe(
      'https://example.com/Article',
    );
  });

  it('prefers a same-host canonical hint', () => {
    expect(
      canonical('https://example.com/article?utm_source=x', 'https://example.com/real'),
    ).toBe('https://example.com/real');
  });

  it('resolves a relative canonical hint', () => {
    expect(canonical('https://example.com/messy/path', '/clean')).toBe(
      'https://example.com/clean',
    );
  });

  it('ignores a cross-host canonical hint', () => {
    // Otherwise any page could claim to be a page on another site, and with a
    // per-user unique index that means writing into someone else's page row.
    expect(
      canonical('https://evil.example/post', 'https://bank.example/account'),
    ).toBe('https://evil.example/post');
  });

  it('normalizes the hint itself', () => {
    expect(
      canonical('https://example.com/a', 'https://www.example.com/b/?utm_source=x#top'),
    ).toBe('https://example.com/b');
  });

  it('falls back to the visited URL when the hint is unparseable', () => {
    expect(canonical('https://example.com/article', 'not a url')).toBe(
      'https://example.com/article',
    );
  });

  it('rejects non-web and malformed URLs', () => {
    expect(canonicalizeUrl('chrome://extensions')).toBeNull();
    expect(canonicalizeUrl('file:///C:/secret.txt')).toBeNull();
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('not a url at all')).toBeNull();
    expect(canonicalizeUrl('')).toBeNull();
  });

  it('keeps http and https distinct', () => {
    expect(canonical('http://example.com/a')).not.toBe(
      canonical('https://example.com/a'),
    );
  });

  it('preserves ports', () => {
    expect(canonical('http://localhost:5173/page')).toBe(
      'http://localhost:5173/page',
    );
  });
});
