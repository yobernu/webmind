import { useState, type ReactNode } from "react";
import Splash from "../components/Splash";
import type { WorkspaceTab } from "../types";
import { prettyUrl } from "../utils/url";
import Chat from "./components/Chat";
import Highlights from "./components/Highlights";
import History from "./components/History";
import Notes from "./components/Notes";
import "./sidepanel.css";
import { useBoot } from "./useBoot";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
  { id: "highlights", label: "Highlights" },
  { id: "history", label: "History" },
];

export default function App() {
  const { phase, status, page } = useBoot();
  const [tab, setTab] = useState<WorkspaceTab>("chat");

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

        {/* <h>Yoseph Berhanu Here</h> */}
      </div>
    </div>
  );
}
