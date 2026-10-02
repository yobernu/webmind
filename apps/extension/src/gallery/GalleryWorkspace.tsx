import type { ReactNode } from "react";
import PanelHeader from "../sidepanel/components/PanelHeader";
import type { PageContext } from "../types";
import { Tabs } from "../ui";
import { noop, READY, USER } from "./fixtures";

/** Header, tabs and body, as the panel composes them. */
export default function GalleryWorkspace({ tab = "chat", children, context = READY }: { tab?: string; children: ReactNode; context?: PageContext }) {
  return (
    <>
      <PanelHeader context={context} snapshot={context.snapshot} user={USER} onOpenSettings={noop} onOpenPrivacy={noop} onSignOut={noop} />
      <Tabs
        idBase={`g-${tab}`}
        label="Workspace"
        selected={tab}
        onSelect={noop}
        items={[
          { id: "chat", label: "Ask" },
          { id: "notes", label: "Notes", count: 3 },
          { id: "highlights", label: "Highlights", count: 12 },
          { id: "history", label: "History" },
        ]}
      />
      <div className="panel-body">{children}</div>
    </>
  );
}
