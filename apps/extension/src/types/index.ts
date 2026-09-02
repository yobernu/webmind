/** A lightweight description of the page the user is currently looking at. */
export interface PageSnapshot {
  url: string
  title: string
  hostname: string
  capturedAt: number
}

/** Messages exchanged between the side panel, background worker and content script. */
export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'GET_PAGE_SNAPSHOT' }

export interface RuntimeResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export type WorkspaceTab = 'chat' | 'notes' | 'highlights' | 'history'

/** Stages of the side panel boot sequence that the splash screen reflects. */
export type BootPhase = 'booting' | 'fading' | 'ready'
