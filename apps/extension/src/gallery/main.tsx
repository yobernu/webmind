import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../sidepanel/sidepanel.css";
import Gallery from "./Gallery";

// The gallery runs outside the extension, where chrome.identity is missing and
// the Google button would always render disabled. A stub shows the real state.
const scope = globalThis as { chrome?: { identity?: unknown } };
scope.chrome ??= {};
scope.chrome.identity ??= {
  launchWebAuthFlow: async () => "",
  getRedirectURL: () => "https://ibgogjgdimkikamkfdhimeelgdjpjibg.chromiumapp.org/",
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
