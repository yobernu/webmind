import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IconButton } from './Button'
import { Menu } from './Menu'
import { Tabs } from './Tabs'

// React only flushes effects synchronously inside act() in a test environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const key = (element: Element, name: string) =>
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  })

function TabsHarness() {
  const [selected, setSelected] = useState<'a' | 'b' | 'c'>('a')
  return (
    <Tabs
      idBase="t"
      label="Sections"
      selected={selected}
      onSelect={setSelected}
      items={[
        { id: 'a', label: 'Ask' },
        { id: 'b', label: 'Notes', count: 3 },
        { id: 'c', label: 'History' },
      ]}
    />
  )
}

describe('Tabs', () => {
  it('keeps one tab stop and links tabs to their panels', () => {
    act(() => root.render(<TabsHarness />))
    const tabs = [...container.querySelectorAll('[role="tab"]')]

    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(tabs[1].getAttribute('aria-controls')).toBe('t-panel-b')
    expect(tabs[1].textContent).toContain(', 3')
  })

  it('moves and selects with the arrow keys, wrapping, and Home/End', () => {
    act(() => root.render(<TabsHarness />))
    const tab = (index: number) => container.querySelectorAll('[role="tab"]')[index]
    const selected = () =>
      [...container.querySelectorAll('[role="tab"]')].findIndex((t) => t.getAttribute('aria-selected') === 'true')

    key(tab(0), 'ArrowRight')
    expect(selected()).toBe(1)
    expect(document.activeElement).toBe(tab(1))

    key(tab(1), 'End')
    expect(selected()).toBe(2)

    key(tab(2), 'ArrowRight')
    expect(selected()).toBe(0)

    key(tab(0), 'ArrowLeft')
    expect(selected()).toBe(2)

    key(tab(2), 'Home')
    expect(selected()).toBe(0)
  })
})

describe('Menu', () => {
  const render = (onSelect = () => {}) =>
    act(() =>
      root.render(
        <Menu
          label="Account"
          trigger={<span>AL</span>}
          items={[
            { label: 'Settings', onSelect },
            { label: 'Sign out', onSelect },
          ]}
        />,
      ),
    )

  it('opens with the first item focused and closes on Escape, returning focus', () => {
    render()
    const trigger = container.querySelector('button') as HTMLButtonElement

    act(() => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Settings')

    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toBe('Sign out')

    key(document.activeElement!, 'Escape')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.menu-list')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('runs the chosen item and closes', () => {
    let chosen = 0
    render(() => (chosen += 1))
    act(() => (container.querySelector('button') as HTMLButtonElement).click())
    act(() => (container.querySelector('.menu-item') as HTMLButtonElement).click())

    expect(chosen).toBe(1)
    expect(container.querySelector('.menu-list')).toBeNull()
  })
})

describe('IconButton', () => {
  it('is named by its label, which also serves as its tooltip', () => {
    act(() => root.render(<IconButton icon="trash" label="Delete note" />))
    const button = container.querySelector('button')!

    expect(button.getAttribute('aria-label')).toBe('Delete note')
    expect(button.getAttribute('title')).toBe('Delete note')
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
