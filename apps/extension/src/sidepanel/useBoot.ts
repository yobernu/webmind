import { useEffect, useState } from 'react'
import type { BootPhase, PageSnapshot } from '../types'
import { delay, getActivePageSnapshot, isExtensionContext } from '../utils/page'

/** Keep the splash up long enough to be read, even on a fast boot. */
const MIN_SPLASH_MS = 1400
/** Must match `--wm-fade` in index.css. */
const FADE_MS = 320

export interface BootState {
  phase: BootPhase
  status: string
  page: PageSnapshot | null
}

/**
 * Runs the side panel boot sequence behind the splash screen and reports
 * progress so the splash can narrate it.
 */
export function useBoot(): BootState {
  const [phase, setPhase] = useState<BootPhase>('booting')
  const [status, setStatus] = useState('Waking up your workspace')
  const [page, setPage] = useState<PageSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    const startedAt = performance.now()

    const boot = async () => {
      setStatus(isExtensionContext() ? 'Reading the current page' : 'Running in dev preview')

      const snapshot = await getActivePageSnapshot().catch(() => null)
      if (cancelled) return
      setPage(snapshot)
      setStatus(snapshot ? `Ready on ${snapshot.hostname}` : 'Ready')

      await delay(Math.max(0, MIN_SPLASH_MS - (performance.now() - startedAt)))
      if (cancelled) return
      setPhase('fading')

      await delay(FADE_MS)
      if (!cancelled) setPhase('ready')
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  return { phase, status, page }
}
