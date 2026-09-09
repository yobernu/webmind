import { useEffect, useState } from "react";
import {
  PANEL_PORT_NAME,
  type PageContext,
  type PanelMessage,
} from "../types";
import { isExtensionContext } from "../utils/page";

const IDLE: PageContext = {
  status: "idle",
  snapshot: null,
  page: null,
  error: null,
};

/**
 * Subscribes to the background worker's view of the current tab.
 *
 * The connection is what authorises page tracking: the worker attaches its tab
 * listeners when this port opens and drops them when it closes, so nothing is
 * recorded while the panel is shut. React therefore never touches
 * `chrome.tabs` itself.
 */
export function usePageContext(): PageContext {
  const [context, setContext] = useState<PageContext>(IDLE);

  useEffect(() => {
    // The Vite dev harness has no extension APIs at all.
    if (!isExtensionContext() || !chrome.runtime?.connect) return;

    let port: chrome.runtime.Port | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;

      port = chrome.runtime.connect({ name: PANEL_PORT_NAME });

      port.onMessage.addListener((message: PanelMessage) => {
        if (message?.type === "PAGE_CONTEXT") setContext(message.context);
      });

      // The MV3 worker is torn down after a few minutes of inactivity, which
      // drops the port; reconnecting revives the worker and re-registers the
      // tab listeners.
      port.onDisconnect.addListener(() => {
        port = null;
        if (!closed) setTimeout(connect, 250);
      });
    };

    connect();

    return () => {
      closed = true;
      port?.disconnect();
    };
  }, []);

  return context;
}
