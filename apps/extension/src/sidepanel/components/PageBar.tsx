import type { PageContext } from "../../types";

/** Human-readable account of what the background worker is doing. */
function describe(context: PageContext): string {
  switch (context.status) {
    case "detecting":
      return "Reading this page…";
    case "ready":
      return context.page?.hasContent
        ? "Page saved with its text"
        : "Page saved";
    case "unsupported":
      return "WebMind cannot read this kind of page";
    case "signed-out":
      return "Sign in to save this page";
    case "consent-required":
      return "Nothing is sent until you have read how WebMind uses pages";
    case "error":
      return context.error ?? "Could not save this page";
    default:
      return "Waiting for a page…";
  }
}

/**
 * The page WebMind has resolved for the current tab. Shows the server-side page
 * id, since everything from here on (chats, notes, highlights) hangs off it.
 */
export default function PageBar({ context }: { context: PageContext }) {
  const { page, snapshot } = context;

  return (
    <div className="page-bar" data-status={context.status}>
      <div className="page-bar-line">
        <span className="page-bar-status">{describe(context)}</span>
        {page && (
          <code className="page-bar-id" title={`Page id ${page.id}`}>
            {page.id.slice(0, 8)}
          </code>
        )}
      </div>

      {page ? (
        <span className="page-bar-canonical" title={page.canonicalUrl}>
          {page.canonicalUrl}
        </span>
      ) : (
        snapshot && (
          <span className="page-bar-canonical" title={snapshot.url}>
            {snapshot.url}
          </span>
        )
      )}
    </div>
  );
}
