# Gloss AI — browser extension

The Chrome (Manifest V3) side panel for Gloss AI: ask about the page you're reading, and keep notes and highlights attached to it.

## Develop

```sh
pnpm install
pnpm dev          # Vite dev server
pnpm build        # side panel, background worker, content script and extractor into dist/
pnpm test         # vitest (anchoring, prose parsing, quoting, helpers)
pnpm typecheck
```

Load `dist/` with **chrome://extensions → Developer mode → Load unpacked**. The manifest `key` pins the extension ID (`ibgogjgdimkikamkfdhimeelgdjpjibg`) so the API's CORS setting and the Google OAuth redirect stay valid across rebuilds.

The API base URL comes from `VITE_API_BASE_URL` (see `.env.example`).

## Component gallery

With `pnpm dev` running, open **http://localhost:5173/gallery.html**. It renders every primitive and screen state from fixtures, in light and dark, at side-panel width; it is the reference for the design and is never packaged.

- `?width=320` sets the frame width
- `?only=primitives` or `?only=screens` limits what is shown, and `?screen=notes` filters screens by name
- `?only=page` runs the real selection toolbar and highlight painter on a sample page

## Layout

| Path | Contents |
| --- | --- |
| `src/ui/` | Design system: tokens, base styles, primitives, icons, brand components |
| `src/sidepanel/` | The panel: `App.tsx` orchestrates; screens in `components/`; data hooks (`useChat`, `useWorkspace`, `useAi`, `useSession`) |
| `src/background/` | Service worker: tracks the active tab while the panel is open, resolves pages |
| `src/content/` | Content script: selection toolbar and highlight painting (no React) |
| `src/extract/` | Readability extractor, injected on demand |
| `src/gallery/` | Dev-only component gallery |

Brand assets and guidelines live in `project_docs/brand/`.
