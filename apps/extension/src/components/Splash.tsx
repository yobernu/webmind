import type { BootPhase } from '../types'
import './Splash.css'

interface SplashProps {
  /** Drives the fade-out; the splash unmounts once the phase reaches `ready`. */
  phase: BootPhase
  /** Short line describing what the boot sequence is doing right now. */
  status: string
}

export default function Splash({ phase, status }: SplashProps) {
  return (
    <div
      className="splash"
      data-state={phase}
      role="status"
      aria-live="polite"
      aria-busy={phase === 'booting'}
    >
      <div className="splash-mark">
        <img src="/favicon.svg" alt="" width="56" height="54" />
      </div>

      <div className="splash-wordmark">
        <h1>WebMind</h1>
        <p>Your persistent AI workspace for the web.</p>
      </div>

      <div className="splash-progress">
        <span />
      </div>

      <p className="splash-status">{status}</p>
    </div>
  )
}
