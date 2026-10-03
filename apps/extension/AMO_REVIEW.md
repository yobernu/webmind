# Building Gloss AI for review

This archive is the complete source of the Gloss AI extension. The uploaded package is built from it with Vite, which bundles and minifies the TypeScript and React sources.

## Requirements

- Node.js 22 (tested with 22.23)
- pnpm 10.33 (`corepack enable && corepack prepare pnpm@10.33.0 --activate`, or `npm install -g pnpm@10.33.0`)
- Any OS (tested on Ubuntu 24.04)

## Build

```sh
pnpm install --frozen-lockfile
pnpm build:firefox
```

The output in `dist-firefox/` matches the uploaded package. `scripts/firefox.mjs` derives its `manifest.json` from `public/manifest.json`. The API address the build uses comes from `.env.production`.

`pnpm build:firefox` runs three Vite builds:

| Output | Source | Config |
| --- | --- | --- |
| `sidepanel.html`, `assets/*`, `background.js` | `src/sidepanel/`, `src/background/` | `vite.config.ts` |
| `content.js` | `src/content/` | `vite.content.config.ts` |
| `extract.js` | `src/extract/` (Mozilla Readability) | `vite.extract.config.ts` |

## Notes for the reviewer

- **What it does:** a sidebar that answers questions about the open page, and keeps notes and highlights attached to it. Page data goes to the Gloss AI API (the URL in `.env.production`) only while the sidebar is open, and only after the user has acknowledged the in-product privacy notice. See `PRIVACY.md` in the repository.
- **Third-party code:**
  - React and ReactDOM (`assets/sidepanel-*.js`).
  - `@mozilla/readability` (`extract.js`), injected into the active tab only when the sidebar needs the page's text.
  - The Newsreader font (SIL OFL, `src/assets/fonts/OFL.txt`).
- **`innerHTML` warnings** come from Readability and from React's DOM renderer. The extension's own code builds DOM with `textContent`, `append` and `DOMParser` on static strings only.
- **`sidePanel.setPanelBehavior`** is Chrome's side-panel API. `src/background/index.ts` calls it only when it exists. In Firefox, the toolbar button calls `sidebarAction.toggle()` instead.
- **Highlights** are drawn with the CSS Custom Highlight API. No markup is inserted into pages; the only addition is a closed-shadow-root toolbar shown under a selection while the sidebar is open.
