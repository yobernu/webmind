import type { PageSnapshot } from '../../types'

// Placeholder surface: notes are not persisted yet.
export default function Notes({ page }: { page: PageSnapshot | null }) {
  return (
    <div className="placeholder">
      <h2>Notes</h2>
      <p>{page ? `Notes for ${page.hostname}` : 'No page context.'}</p>
      <p>
        Not wired up yet — implement <code>src/api/notes.ts</code>.
      </p>
    </div>
  )
}
