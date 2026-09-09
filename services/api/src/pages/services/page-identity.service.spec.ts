import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { PageIdentityService } from './page-identity.service.js';

const service = new PageIdentityService();

describe('PageIdentityService', () => {
  it('derives url, canonical url, domain and title', () => {
    expect(
      service.identify({
        url: 'https://www.example.com/article?utm_source=x#top',
        title: 'My Article',
      }),
    ).toEqual({
      url: 'https://www.example.com/article?utm_source=x#top',
      canonicalUrl: 'https://example.com/article',
      domain: 'example.com',
      title: 'My Article',
    });
  });

  it('keeps the visited url verbatim for display', () => {
    const visited = 'https://example.com/a?utm_medium=email';
    expect(service.identify({ url: visited }).url).toBe(visited);
  });

  it('treats a blank or whitespace title as absent', () => {
    expect(service.identify({ url: 'https://example.com/a', title: '   ' }).title).toBeNull();
    expect(service.identify({ url: 'https://example.com/a' }).title).toBeNull();
  });

  it('trims a title', () => {
    expect(
      service.identify({ url: 'https://example.com/a', title: '  Spaced  ' }).title,
    ).toBe('Spaced');
  });

  it('honours a same-host canonical hint', () => {
    expect(
      service.identify({
        url: 'https://example.com/dupe',
        canonicalHint: 'https://example.com/original',
      }).canonicalUrl,
    ).toBe('https://example.com/original');
  });

  it('rejects urls that are not addressable web pages', () => {
    for (const url of ['chrome://extensions', 'file:///c:/secret', 'nonsense']) {
      expect(() => service.identify({ url })).toThrow(BadRequestException);
    }
  });
});
