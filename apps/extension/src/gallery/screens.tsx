import type { ReactNode } from "react";
import ChatView, { type ChatViewProps } from "../sidepanel/components/ChatView";
import PanelHeader from "../sidepanel/components/PanelHeader";
import PrivacyPanel from "../sidepanel/components/PrivacyPanel";
import Settings from "../sidepanel/components/Settings";
import AuthPanel from "../sidepanel/components/AuthPanel";
import Highlights from "../sidepanel/components/Highlights";
import { SearchResults } from "../sidepanel/components/History";
import History from "../sidepanel/components/History";
import Notes from "../sidepanel/components/Notes";
import Splash from "../components/Splash";
import {
  AI,
  CONVERSATIONS,
  EMPTY_WORKSPACE,
  LONG_QUOTE,
  MESSAGES,
  noop,
  PAGE,
  READY,
  SEARCH_RESULTS,
  SESSION,
  SNAPSHOT,
  USER,
  WORKSPACE,
} from "./fixtures";
import Workspace from "./GalleryWorkspace";

const chatBase: ChatViewProps = {
  pageTitle: PAGE.title,
  messages: [],
  streaming: "",
  pending: false,
  stage: null,
  elapsedSeconds: 0,
  error: null,
  canRetry: false,
  onRetry: noop,
  conversations: [],
  conversationId: null,
  onOpenConversation: noop,
  onNewChat: noop,
  draft: "",
  onDraftChange: noop,
  quote: null,
  onClearQuote: noop,
  onSubmit: noop,
  onStop: noop,
  ai: { disabled: false, label: "Anthropic Claude", model: "claude-opus-5-5", usingUserKey: false },
  onOpenSettings: noop,
};

/** Screen states rendered from fixtures, reviewed in light and dark. */
export const screens: { name: string; render: () => ReactNode }[] = [
  {
    name: "Ask · conversation",
    render: () => (
      <Workspace>
        <ChatView
          {...chatBase}
          conversations={CONVERSATIONS}
          conversationId="c1"
          messages={MESSAGES}
          quote={LONG_QUOTE.slice(0, 180)}
          draft="Does this apply to CORS failures too?"
        />
      </Workspace>
    ),
  },
  {
    name: "Ask · answering",
    render: () => (
      <Workspace>
        <ChatView
          {...chatBase}
          conversations={CONVERSATIONS}
          conversationId="c1"
          messages={MESSAGES.slice(0, 3)}
          streaming="Pass an AbortSignal: AbortSignal.timeout(5000) rejects the promise"
          pending
          stage="thinking"
        />
      </Workspace>
    ),
  },
  {
    name: "Ask · thinking, error",
    render: () => (
      <Workspace context={{ ...READY, status: "detecting" }}>
        <ChatView
          {...chatBase}
          messages={MESSAGES.slice(2, 3)}
          error="The answer could not be completed. Your question was saved."
          canRetry
        />
      </Workspace>
    ),
  },
  {
    name: "Ask · empty, no provider",
    render: () => (
      <Workspace context={{ status: "error", snapshot: SNAPSHOT, page: PAGE, error: "Cannot reach the API at http://localhost:3000" }}>
        <ChatView {...chatBase} ai={{ disabled: true, label: null, usingUserKey: false }} />
      </Workspace>
    ),
  },
  {
    name: "Settings",
    render: () => (
      <>
        <PanelHeader context={READY} snapshot={SNAPSHOT} user={USER} onOpenSettings={noop} onOpenPrivacy={noop} onSignOut={noop} />
        <div className="panel-body">
          <Settings ai={AI} user={USER} onClose={noop} onSignOut={noop} onDeleteAccount={async () => {}} />
        </div>
      </>
    ),
  },
  {
    name: "Onboarding",
    render: () => (
      <>
        <PanelHeader context={{ status: "consent-required", snapshot: SNAPSHOT, page: null, error: null }} snapshot={SNAPSHOT} user={USER} onOpenSettings={noop} onOpenPrivacy={noop} onSignOut={noop} />
        <div className="panel-body">
          <PrivacyPanel onAcknowledge={noop} />
        </div>
      </>
    ),
  },
  {
    name: "Notes",
    render: () => (
      <Workspace tab="notes">
        <Notes context={READY} workspace={WORKSPACE} intent={{ kind: "note", sourceText: "resolves to the Response object representing the response to your request" }} onIntentHandled={noop} />
      </Workspace>
    ),
  },
  {
    name: "Notes · empty",
    render: () => (
      <Workspace tab="notes">
        <Notes context={READY} workspace={EMPTY_WORKSPACE} intent={null} onIntentHandled={noop} />
      </Workspace>
    ),
  },
  {
    name: "Highlights",
    render: () => (
      <Workspace tab="highlights">
        <Highlights context={READY} workspace={WORKSPACE} missingIds={new Set(["h3"])} painted intent={null} onIntentHandled={noop} onIntent={noop} />
      </Workspace>
    ),
  },
  {
    name: "History",
    render: () => (
      <Workspace tab="history">
        <History context={READY} workspace={WORKSPACE} onOpenConversation={noop} onOpenResult={noop} />
        <div className="history-section" style={{ paddingTop: 0 }}>
          <SearchResults results={SEARCH_RESULTS} onOpenResult={noop} />
        </div>
      </Workspace>
    ),
  },
  {
    name: "Sign in",
    render: () => (
      <div className="panel-body">
        <AuthPanel session={SESSION} />
      </div>
    ),
  },
  {
    name: "Sign in · error",
    render: () => (
      <div className="panel-body">
        <AuthPanel session={{ ...SESSION, error: "Invalid email or password", errorKind: "credentials" }} />
      </div>
    ),
  },
  {
    name: "Splash",
    render: () => <Splash phase="booting" status="Reading the current page" />,
  },
];
