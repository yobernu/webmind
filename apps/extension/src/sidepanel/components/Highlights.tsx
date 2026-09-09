import type { PageContext, PageSnapshot } from "../../types";

// Placeholder surface: selection capture is not wired to the API yet.
export default function Highlights({
  page,
  context,
}: {
  page: PageSnapshot | null;
  context: PageContext;
}) {
  return (
    <div className="placeholder">
      <h2>Highlights</h2>
      <p>
        {page
          ? "Select text on the page to capture it here."
          : "No page context."}
      </p>
      {context.page && (
        <p>
          They will attach to page <code>{context.page.id}</code>.
        </p>
      )}
      <p>
        Not wired up yet — implement <code>src/api/highlights.ts</code>.
      </p>
    </div>
  );
}
