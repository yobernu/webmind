import type { PageContext, PageSnapshot } from "../../types";

// Placeholder surface: notes are not persisted yet.
export default function Notes({
  page,
  context,
}: {
  page: PageSnapshot | null;
  context: PageContext;
}) {
  return (
    <div className="placeholder">
      <h2>Notes</h2>
      <p>{page ? `Notes for ${page.domain}` : "No page context."}</p>
      {context.page && (
        <p>
          They will attach to page <code>{context.page.id}</code>.
        </p>
      )}
      <p>
        Not wired up yet — implement <code>src/api/notes.ts</code>.
      </p>
    </div>
  );
}
