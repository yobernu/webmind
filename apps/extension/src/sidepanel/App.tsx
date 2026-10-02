import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deleteAccount } from "../api/auth";
import Splash from "../components/Splash";
import { PRIVACY_NOTICE_VERSION, STORAGE_KEYS } from "../config";
import type {
  CapturedSelection,
  Conversation,
  Highlight,
  PanelIntent,
  RuntimeMessage,
  RuntimeResponse,
  SearchResult,
  SelectionAction,
  WorkspaceTab,
} from "../types";
import { isExtensionContext, openOrFocusUrl, sendToActiveTab } from "../utils/page";
import { readStored, writeStored } from "../utils/storage";
import { prettyUrl } from "../utils/url";
import AuthPanel from "./components/AuthPanel";
import Chat from "./components/Chat";
import Highlights from "./components/Highlights";
import History from "./components/History";
import Notes from "./components/Notes";
import PageBar from "./components/PageBar";
import PrivacyPanel from "./components/PrivacyPanel";
import "./sidepanel.css";
import { useBoot } from "./useBoot";
import { usePageContext } from "./usePageContext";
import { useSession } from "./useSession";
import { useWorkspace } from "./useWorkspace";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
  { id: "highlights", label: "Highlights" },
  { id: "history", label: "History" },
];

/** How long a confirmation such as "Highlight saved" stays up. */
const NOTICE_MS = 2_500;

/** The fragment never changes which page is shown. */
function withoutHash(url: string | undefined): string {
  return url?.split("#")[0] ?? "";
}

/** What was painted, and for which tab load and highlight set. */
interface PaintState {
  missing: ReadonlySet<string>;
  key: number | null;
  highlights: Highlight[] | null;
}

const NOTHING_PAINTED: PaintState = { missing: new Set(), key: null, highlights: null };

export default function App() {
  const session = useSession();
  const { phase, status, page } = useBoot(session.status !== "restoring");
  const pageContext = usePageContext();
  const [tab, setTab] = useState<WorkspaceTab>("chat");
  const [intent, setIntent] = useState<PanelIntent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const signedIn = session.status === "signed-in";

  // null while the stored acknowledgement is being read.
  const [privacyAcked, setPrivacyAcked] = useState<boolean | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readStored<number>(STORAGE_KEYS.privacyAck)
      .catch(() => null)
      .then((version) => {
        if (!cancelled) setPrivacyAcked((version ?? 0) >= PRIVACY_NOTICE_VERSION);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledgePrivacy = useCallback(() => {
    setPrivacyAcked(true);
    // The background worker watches this key and starts syncing the page.
    void writeStored(STORAGE_KEYS.privacyAck, PRIVACY_NOTICE_VERSION);
  }, []);

  const removeAccount = useCallback(async () => {
    await deleteAccount();
    setShowPrivacy(false);
    await session.signOut();
  }, [session]);

  // Remembers the last page actually resolved, so a transient null does not
  // change the chat's identity. Only a genuinely different page should reset
  // the thread. Adjusting state during render is React's documented way to
  // derive a value that has to persist across renders.
  const [chatKey, setChatKey] = useState("no-page");

  if (pageContext.page && pageContext.page.id !== chatKey) {
    setChatKey(pageContext.page.id);
  }

  // The background worker's snapshot wins once it arrives; useBoot's is only
  // there to fill the header on the very first paint.
  const snapshot = pageContext.snapshot ?? page;

  // While the worker re-detects the page already shown it reports page: null;
  // keeping the last page's workspace avoids a flash of empty lists.
  const workspacePageId =
    pageContext.page?.id ??
    (pageContext.status === "detecting" && chatKey !== "no-page" ? chatKey : null);
  const workspace = useWorkspace(signedIn ? workspacePageId : null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Repaint saved highlights whenever the tab finishes loading a page or the
  // set changes. Each completed load gets a fresh snapshot, hence the key.
  const [paint, setPaint] = useState<PaintState>(NOTHING_PAINTED);
  const paintKey =
    signedIn && pageContext.status === "ready" && pageContext.page
      ? (pageContext.snapshot?.capturedAt ?? null)
      : null;

  useEffect(() => {
    if (paintKey === null || workspace.loading) return;

    const highlights = workspace.highlights;
    let cancelled = false;

    void sendToActiveTab<{ missing: string[] }>({
      type: "PAINT_HIGHLIGHTS",
      highlights: highlights.map(({ id, selector, selectedText }) => ({
        id,
        selector,
        selectedText,
      })),
    }).then((reply) => {
      if (cancelled) return;
      setPaint({
        // No reply means the page could not be scripted at all.
        missing: new Set(reply?.ok ? (reply.data?.missing ?? []) : highlights.map((h) => h.id)),
        key: paintKey,
        highlights,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [paintKey, workspace.highlights, workspace.loading]);

  const painted = paint.key === paintKey && paint.highlights === workspace.highlights;

  const clearIntent = useCallback(() => setIntent(null), []);

  const requestIntent = useCallback((next: PanelIntent) => {
    setIntent(next);
    setTab(next.kind === "note" || next.kind === "focus-note" ? "notes" : "chat");
  }, []);

  // --- Messages from the content script ------------------------------------

  // The toolbar only appears when an open panel here can act on the selection.
  const acceptsSelections = useEffectEvent(
    () => signedIn && pageContext.status === "ready" && Boolean(pageContext.page),
  );

  const onSelectionAction = useEffectEvent(
    (action: SelectionAction, selection: CapturedSelection) => {
      if (!pageContext.page) return;
      // A selection made just before a navigation belongs to the old page.
      if (withoutHash(selection.url) !== withoutHash(pageContext.snapshot?.url)) return;

      if (action === "ask") {
        requestIntent({ kind: "ask", text: selection.text });
      } else if (action === "note") {
        requestIntent({ kind: "note", sourceText: selection.text });
      } else {
        void workspace.addHighlight(selection).then((saved) => {
          if (saved) showNotice("Highlight saved");
        });
      }
    },
  );

  useEffect(() => {
    if (!isExtensionContext() || !chrome.runtime?.onMessage || !chrome.windows) return;

    // Content scripts broadcast to every extension page. Only the panel in the
    // window of the sending tab may answer, or two windows would both react.
    let windowId: number | undefined;
    void chrome.windows.getCurrent().then((current) => {
      windowId = current.id;
    });

    const listener = (
      message: RuntimeMessage,
      sender: chrome.runtime.MessageSender,
      respond: (response: RuntimeResponse) => void,
    ) => {
      const from = sender.tab;
      if (!from?.active || windowId === undefined || from.windowId !== windowId) return false;

      if (message?.type === "PANEL_PING") {
        // Not answering leaves the toolbar hidden.
        if (acceptsSelections()) respond({ ok: true });
      } else if (message?.type === "SELECTION_ACTION") {
        onSelectionAction(message.action, message.selection);
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // --- History and search -------------------------------------------------

  const openConversation = useCallback(
    (conversation: Conversation) => {
      requestIntent({
        kind: "open-conversation",
        pageId: conversation.pageId,
        conversationId: conversation.id,
      });
    },
    [requestIntent],
  );

  const openResult = useCallback(
    (result: SearchResult) => {
      const pageId = result.page.id;

      if (result.type === "message" && result.conversationId) {
        requestIntent({ kind: "open-conversation", pageId, conversationId: result.conversationId });
      } else if (result.type === "note") {
        requestIntent({ kind: "focus-note", pageId, noteId: result.id });
      } else if (result.type === "highlight") {
        setIntent({ kind: "focus-highlight", pageId, highlightId: result.id });
        setTab("highlights");
      }

      // The intent waits until the worker reports that page as current.
      if (pageId !== pageContext.page?.id) void openOrFocusUrl(result.page.url);
    },
    [pageContext.page?.id, requestIntent],
  );

  const selectTab = (id: WorkspaceTab) => {
    setTab(id);
    // Picking a tab by hand abandons whatever was pending.
    setIntent(null);
    if (id === "history") void workspace.refresh();
  };

  const panels: Record<WorkspaceTab, ReactNode> = {
    // Keyed by the last *real* page rather than the current one. The worker
    // reports page: null while re-resolving (a tab title change, or the MV3
    // worker being recycled), and remounting Chat on that transient null would
    // abort an answer that is still streaming.
    chat: (
      <Chat
        key={chatKey}
        context={pageContext}
        intent={intent}
        onIntentHandled={clearIntent}
      />
    ),
    notes: (
      <Notes
        context={pageContext}
        workspace={workspace}
        intent={intent}
        onIntentHandled={clearIntent}
      />
    ),
    highlights: (
      <Highlights
        context={pageContext}
        workspace={workspace}
        missingIds={paint.missing}
        painted={painted}
        intent={intent}
        onIntentHandled={clearIntent}
        onIntent={requestIntent}
      />
    ),
    history: (
      <History
        context={pageContext}
        workspace={workspace}
        onOpenConversation={openConversation}
        onOpenResult={openResult}
      />
    ),
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
              <button
                type="button"
                onClick={() => setShowPrivacy((shown) => !shown)}
                aria-pressed={showPrivacy}
              >
                Privacy
              </button>
              <button type="button" onClick={() => void session.signOut()}>
                Sign out
              </button>
            </div>

            <PageBar context={pageContext} />

            <nav className="panel-tabs" role="tablist" aria-label="Workspace">
              {TABS.map(({ id, label }) => {
                const count =
                  id === "notes"
                    ? workspace.counts.notes
                    : id === "highlights"
                      ? workspace.counts.highlights
                      : 0;

                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => selectTab(id)}
                  >
                    {label}
                    {count > 0 && <span className="tab-count">{count}</span>}
                  </button>
                );
              })}
            </nav>

            {notice && (
              <p className="panel-notice" role="status">
                {notice}
              </p>
            )}

            <main className="panel-body" role="tabpanel">
              {privacyAcked === false || showPrivacy ? (
                <PrivacyPanel
                  acknowledged={privacyAcked === true}
                  onAcknowledge={acknowledgePrivacy}
                  onClose={() => setShowPrivacy(false)}
                  onDeleteAccount={removeAccount}
                />
              ) : (
                panels[tab]
              )}
            </main>
          </>
        ) : (
          <main className="panel-body">
            <AuthPanel session={session} />
          </main>
        )}
      </div>
    </div>
  );
}
