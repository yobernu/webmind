import type { BootPhase } from '../types'
import { BrandMark, Wordmark } from '../ui'
import './Splash.css'

interface SplashProps {
  /** Drives the fade-out; the splash unmounts once the phase reaches `ready`. */
  phase: BootPhase
  /** Short line describing what the boot sequence is doing right now. */
  status: string
}

/** Shown for a moment while the session restores; deliberately quiet. */
export default function Splash({ phase, status }: SplashProps) {
  return (
    <div className="splash" data-state={phase} role="status" aria-live="polite" aria-busy={phase === 'booting'}>
      <div className="splash-lockup">
        <BrandMark size={44} />
        <Wordmark height={26} />
      </div>
      <p className="visually-hidden">{status}</p>
    </div>
  )
}
