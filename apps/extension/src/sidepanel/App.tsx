import { useState, type ReactNode } from "react";
import Splash from "../components/Splash";
import type { WorkspaceTab } from "../types";
import { prettyUrl } from "../utils/url";
import AuthPanel from "./components/AuthPanel";
import Chat from "./components/Chat";
import Highlights from "./components/Highlights";
import History from "./components/History";
import Notes from "./components/Notes";
import "./sidepanel.css";
import { useBoot } from "./useBoot";
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
  const [tab, setTab] = useState<WorkspaceTab>("chat");

  const signedIn = session.status === "signed-in";

  const panels: Record<WorkspaceTab, ReactNode> = {
    chat: <Chat page={page} />,
    notes: <Notes page={page} />,
    highlights: <Highlights page={page} />,
    history: <History />,
  };

  return (
    <div className="panel" data-booted={phase === "ready"}>
      {phase !== "ready" && <Splash phase={phase} status={status} />}

      <div className="panel-shell" aria-hidden={phase !== "ready"}>
        <header className="panel-header">
          <img src="/favicon.svg" alt="" />
          <div className="panel-header-text">
            <strong>WebMind</strong>
            <span title={page?.url}>
              {page ? prettyUrl(page.url) : "No page context"}
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
