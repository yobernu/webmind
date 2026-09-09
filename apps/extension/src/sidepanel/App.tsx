import { useState, type ReactNode } from "react";
import Splash from "../components/Splash";
import type { WorkspaceTab } from "../types";
import { prettyUrl } from "../utils/url";
import AuthPanel from "./components/AuthPanel";
import Chat from "./components/Chat";
import Highlights from "./components/Highlights";
import History from "./components/History";
import Notes from "./components/Notes";
import PageBar from "./components/PageBar";
import "./sidepanel.css";
import { useBoot } from "./useBoot";
import { usePageContext } from "./usePageContext";
import { useSession } from "./useSession";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
  { id: "highlights", label: "Highlights" },
  { id: "history", label: "History" },
];

export default function App() {
  const session = useSession();
  const { phase, status, page } = useBoot(session.status !== "restoring");
  const pageContext = usePageContext();
  const [tab, setTab] = useState<WorkspaceTab>("chat");

  const signedIn = session.status === "signed-in";

  // The background worker's snapshot wins once it arrives; useBoot's is only
  // there to fill the header on the very first paint.
  const snapshot = pageContext.snapshot ?? page;

  const panels: Record<WorkspaceTab, ReactNode> = {
    // Keyed by page so switching pages remounts the chat with fresh state,
    // rather than the hook having to reset itself.
    chat: <Chat key={pageContext.page?.id ?? "no-page"} context={pageContext} />,
    notes: <Notes page={snapshot} context={pageContext} />,
    highlights: <Highlights page={snapshot} context={pageContext} />,
    history: <History />,
  };

  return (
    <div className="panel" data-booted={phase === "ready"}>
      {phase !== "ready" && <Splash phase={phase} status={status} />}

      <div className="panel-shell" aria-hidden={phase !== "ready"}>
        <header className="panel-header">
          <img src="/favicon.svg" alt="" />
          <div className="panel-header-text">
            <strong>{snapshot?.domain ?? "WebMind"}</strong>
            <span title={snapshot?.url}>
              {snapshot
                ? snapshot.title || prettyUrl(snapshot.url)
                : "No page context"}
            </span>
          </div>
        </header>

        {signedIn ? (
          <>
            <div className="panel-account">
              <span title={session.user?.email}>
                {session.user?.name || session.user?.email}
              </span>
              <button type="button" onClick={() => void session.signOut()}>
                Sign out
              </button>
            </div>

            <PageBar context={pageContext} />

            <nav className="panel-tabs" role="tablist" aria-label="Workspace">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <main className="panel-body" role="tabpanel">
              {panels[tab]}
            </main>
          </>
        ) : (
          <main className="panel-body">
            <AuthPanel session={session} />
          </main>
        )}

        {/* <h>Yoseph Berhanu Here</h> */}
      </div>
    </div>
  );
}
