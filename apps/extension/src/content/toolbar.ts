import type { SelectionAction } from '../types'
import { MARK } from '../ui/brand/paths'

// Icons from the panel's set (src/ui/Icon.tsx), as strings: the content
// script is plain TS and stays free of React.
const ICON_ATTRS =
  'width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

const ICONS: Record<SelectionAction, string> = {
  highlight: `<svg ${ICON_ATTRS}><path d="M9.6 2.6 13.4 6.4 8.15 11.65 4.35 7.85z"/><path d="M4.35 7.85 2.75 12.5l1.25.75 4.15-1.6"/><path d="M9.75 13.25h3.5"/></svg>`,
  ask: `<svg ${ICON_ATTRS}><path d="M3 4.25c0-.83.67-1.5 1.5-1.5h7c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H8.25L5.5 13v-2.25h-1A1.5 1.5 0 0 1 3 9.25z"/></svg>`,
  note: `<svg ${ICON_ATTRS}><path d="M10.35 2.9a1.45 1.45 0 0 1 2.05 2.05L6.1 11.25l-2.85.75.75-2.85z"/><path d="M8.5 13.25h4.25"/></svg>`,
}

const ACTIONS: { action: SelectionAction; label: string }[] = [
  { action: 'highlight', label: 'Highlight' },
  { action: 'ask', label: 'Ask' },
  { action: 'note', label: 'Note' },
]

const MARK_SVG = `<svg width="18" height="18" viewBox="${MARK.viewBox}" aria-hidden="true"><rect x="${MARK.swipe.x}" y="${MARK.swipe.y}" width="${MARK.swipe.w}" height="${MARK.swipe.h}" transform="rotate(-6 ${MARK.swipe.cx} ${MARK.swipe.cy})" fill="#F5D547"/><path fill="currentColor" transform="${MARK.glyph.transform}" d="${MARK.glyph.d}"/></svg>`

// A closed shadow root: the page's CSS and scripts can't restyle or read it,
// and its styles can't leak out. @font-face is ignored inside shadow roots,
// so the toolbar uses the system font rather than the panel's serif.
const STYLE = `
  :host { all: initial; }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid #E4DFD3;
    border-radius: 8px;
    background: #FAF8F3;
    color: #1C1B19;
    box-shadow: 0 1px 2px rgba(28, 27, 25, 0.06), 0 6px 20px rgba(28, 27, 25, 0.14);
    font: 500 12px/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-right: 1px;
    border-right: 1px solid #E4DFD3;
    padding-right: 3px;
  }
  button {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border-radius: 5px;
    color: #1C1B19;
    cursor: pointer;
    white-space: nowrap;
  }
  button svg { color: #55524B; }
  button:hover { background: rgba(28, 27, 25, 0.06); }
  button:focus-visible { outline: 2px solid #1C1B19; outline-offset: 1px; }
  @media (prefers-color-scheme: dark) {
    .bar {
      border-color: #34322D;
      background: #22211E;
      color: #EDE9E0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    .mark { border-right-color: #34322D; }
    button { color: #EDE9E0; }
    button svg { color: #B5B0A5; }
    button:hover { background: rgba(237, 233, 224, 0.08); }
    button:focus-visible { outline-color: #EDE9E0; }
  }
  @media (forced-colors: active) {
    .bar { border-color: CanvasText; }
  }
`

export interface SelectionToolbar {
  /** Shows the toolbar under a selection's bounding box (viewport coordinates). */
  show(rect: DOMRect): void
  hide(): void
  /** Whether an event target is part of the toolbar. */
  contains(target: EventTarget | null): boolean
}

export function createSelectionToolbar(onAction: (action: SelectionAction) => void): SelectionToolbar {
  const host = document.createElement('gloss-selection-toolbar')
  host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;display:none;'

  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Gloss AI')

  const mark = document.createElement('span')
  mark.className = 'mark'
  mark.innerHTML = MARK_SVG
  bar.append(mark)

  for (const { action, label } of ACTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    // Static markup from this file only; nothing from the page is inserted.
    button.innerHTML = `${ICONS[action]}<span>${label}</span>`
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onAction(action)
    })
    bar.append(button)
  }

  shadow.append(style, bar)

  // Pressing a button must not collapse the selection it acts on.
  host.addEventListener('mousedown', (event) => event.preventDefault())

  // Attached to <html>, outside <body>, so it never enters the text index.
  document.documentElement.append(host)

  return {
    show(rect) {
      host.style.display = 'block'
      const width = host.offsetWidth
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - width / 2),
        document.documentElement.clientWidth - width - 8,
      )
      // Below the selection, where the browser's own context menu is not.
      host.style.top = `${rect.bottom + window.scrollY + 8}px`
      host.style.left = `${left + window.scrollX}px`
    },
    hide() {
      host.style.display = 'none'
    },
    contains(target) {
      return target === host
    },
  }
}
