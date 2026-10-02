import type { SelectionAction } from '../types'

const ACTIONS: { action: SelectionAction; label: string }[] = [
  { action: 'highlight', label: 'Highlight' },
  { action: 'ask', label: 'Ask AI' },
  { action: 'note', label: 'Add note' },
]

// Lives in a closed shadow root, so neither the page's CSS nor its scripts can
// restyle or read it, and its styles cannot leak into the page.
const STYLE = `
  :host { all: initial; }
  .bar {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: #17141f;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.08);
    font: 500 12px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  button {
    all: unset;
    cursor: pointer;
    padding: 7px 10px;
    border-radius: 7px;
    color: #f4f2fa;
    white-space: nowrap;
  }
  button:hover, button:focus-visible { background: rgba(134, 59, 255, 0.45); }
`

export interface SelectionToolbar {
  /** Shows the toolbar under a selection's bounding box (viewport coordinates). */
  show(rect: DOMRect): void
  hide(): void
  /** Whether an event target is part of the toolbar. */
  contains(target: EventTarget | null): boolean
}

export function createSelectionToolbar(
  onAction: (action: SelectionAction) => void,
): SelectionToolbar {
  const host = document.createElement('webmind-selection-toolbar')
  host.style.cssText =
    'position:absolute;z-index:2147483647;top:0;left:0;display:none;'

  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = STYLE
  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'WebMind')

  for (const { action, label } of ACTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
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
