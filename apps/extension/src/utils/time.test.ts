import { describe, expect, it } from 'vitest'
import { formatRelative } from './time'

const now = Date.parse('2026-10-03T12:00:00Z')
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString()

describe('formatRelative', () => {
  it('says just now for the last few seconds', () => {
    expect(formatRelative(ago(10), now)).toBe('just now')
  })

  it('picks the largest sensible unit', () => {
    expect(formatRelative(ago(5 * 60), now)).toMatch(/5 minutes ago/)
    expect(formatRelative(ago(3 * 3600), now)).toMatch(/3 hours ago/)
    expect(formatRelative(ago(24 * 3600), now)).toMatch(/yesterday|1 day ago/)
  })

  it('is empty for missing or invalid input', () => {
    expect(formatRelative(null, now)).toBe('')
    expect(formatRelative('nonsense', now)).toBe('')
  })
})
