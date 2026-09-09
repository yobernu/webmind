import { useEffect, useRef, useState } from 'react'
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
 *
 * @param sessionReady Whether the stored auth session has finished restoring.
 *   The splash stays up until it has, so the panel never flashes the sign-in
 *   form at an already-signed-in user.
 */
export function useBoot(sessionReady: boolean): BootState {
  const [phase, setPhase] = useState<BootPhase>('booting')
  const [page, setPage] = useState<PageSnapshot | null>(null)
  const [pageReady, setPageReady] = useState(false)
  const startedAt = useRef(0)
  const finishing = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (!startedAt.current) startedAt.current = performance.now()

    const readPage = async () => {
      const snapshot = await getActivePageSnapshot().catch(() => null)
      if (cancelled) return
      setPage(snapshot)
      setPageReady(true)
    }

    void readPage()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (finishing.current || !pageReady || !sessionReady) return

    finishing.current = true
    let cancelled = false

    const finish = async () => {
      await delay(
        Math.max(0, MIN_SPLASH_MS - (performance.now() - startedAt.current)),
      )
      if (cancelled) return
      setPhase('fading')

      await delay(FADE_MS)
      if (!cancelled) setPhase('ready')
    }

    void finish()
    return () => {
      cancelled = true
      // Reset so React's StrictMode remount can re-run the sequence.
      finishing.current = false
    }
  }, [pageReady, sessionReady])

  const status = !pageReady || !sessionReady
    ? isExtensionContext()
      ? 'Reading the current page'
      : 'Running in dev preview'
    : page
      ? `Ready on ${page.domain}`
      : 'Ready'

  return { phase, status, page }
}
