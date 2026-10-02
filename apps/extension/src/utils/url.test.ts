import { describe, expect, it } from 'vitest'
import { hostnameOf, isRestrictedUrl, prettyUrl } from './url'

describe('url helpers', () => {
  it('reads the hostname without www', () => {
    expect(hostnameOf('https://www.example.com/a?b=1')).toBe('example.com')
    expect(hostnameOf('not a url')).toBe('')
  })

  it('treats browser-internal pages as restricted', () => {
    for (const url of [
      'chrome://settings',
      'chrome-extension://abc/sidepanel.html',
      'about:blank',
      'file:///home/me/notes.txt',
      'view-source:https://example.com',
      'https://chromewebstore.google.com/detail/x',
      '',
    ]) {
      expect(isRestrictedUrl(url), url).toBe(true)
    }
  })

  it('allows ordinary web pages', () => {
    expect(isRestrictedUrl('https://developer.mozilla.org/en-US/docs/Web')).toBe(false)
    expect(isRestrictedUrl('http://localhost:3000/')).toBe(false)
  })

  it('shortens URLs for display', () => {
    expect(prettyUrl('https://www.example.com/')).toBe('example.com')
    expect(prettyUrl('https://example.com/docs/page')).toBe('example.com/docs/page')
  })
})
