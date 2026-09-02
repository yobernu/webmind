import type { PageSnapshot } from '../../types'

// Placeholder surface: selection capture is not wired to the API yet.
export default function Highlights({ page }: { page: PageSnapshot | null }) {
  return (
    <div className="placeholder">
      <h2>Highlights</h2>
      <p>
        {page
          ? 'Select text on the page to capture it here.'
          : 'No page context.'}
      </p>
      <p>
        Not wired up yet — implement <code>src/api/highlights.ts</code>.
      </p>
    </div>
  )
}
