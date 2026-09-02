import type { PageSnapshot } from "../../types";

// Placeholder surface: the chat transport is not wired to the API yet.
export default function Chat({ page }: { page: PageSnapshot | null }) {
  return (
    <div className="placeholder">
      <h2>Chat - app</h2>
      <p>
        {page
          ? `Ask anything about “${page.title || page.hostname}”.`
          : "Open a web page to start a grounded conversation."}
      </p>
      <p>
        Not wired up yet — implement <code>src/api/conversations.ts</code>.
      </p>
    </div>
  );
}
