import { beforeEach, describe, expect, it } from 'vitest'
import {
  AFFIX_LENGTH,
  anchorSelector,
  buildTextIndex,
  describeRange,
  offsetsToRange,
  rangeToOffsets,
} from './anchor'

function page(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

/** A range over the first occurrence of `text` inside one text node. */
function rangeOver(text: string, occurrence = 0): Range {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let seen = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = (node as Text).data
    let at = data.indexOf(text)
    while (at !== -1) {
      if (seen++ === occurrence) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + text.length)
        return range
      }
      at = data.indexOf(text, at + 1)
    }
  }
  throw new Error(`"${text}" not found`)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('buildTextIndex', () => {
  it('concatenates visible text and skips scripts and styles', () => {
    const index = buildTextIndex(
      page('<p>Hello <b>world</b></p><script>var x = 1</script><style>p{}</style><p>!</p>'),
    )

    expect(index.text).toBe('Hello world!')
    expect(index.starts).toEqual([0, 6, 11])
  })
})

describe('describeRange', () => {
  it('records the quote, its context and its offsets', () => {
    page('<p>The quick brown fox jumps over the lazy dog.</p>')
    const index = buildTextIndex(document.body)

    const selector = describeRange(rangeOver('brown fox'), index)

    expect(selector).toEqual({
      quote: { exact: 'brown fox', prefix: 'The quick ', suffix: ' jumps over the lazy dog.' },
      position: { start: 10, end: 19 },
    })
  })

  it('caps the context either side', () => {
    page(`<p>${'a'.repeat(100)} target ${'b'.repeat(100)}</p>`)
    const selector = describeRange(rangeOver('target'), buildTextIndex(document.body))

    expect(selector?.quote.prefix).toHaveLength(AFFIX_LENGTH)
    expect(selector?.quote.suffix).toHaveLength(AFFIX_LENGTH)
  })

  it('spans several elements', () => {
    page('<p>one <em>two</em> three</p>')
    const range = document.createRange()
    const [first] = document.body.querySelector('p')!.childNodes
    const last = document.body.querySelector('p')!.lastChild!
    range.setStart(first, 0)
    range.setEnd(last, 6)

    expect(describeRange(range, buildTextIndex(document.body))?.quote.exact).toBe('one two three')
  })

  it('returns null for whitespace-only selections', () => {
    page('<p>a   b</p>')
    const range = document.createRange()
    const text = document.body.querySelector('p')!.firstChild!
    range.setStart(text, 1)
    range.setEnd(text, 4)

    expect(describeRange(range, buildTextIndex(document.body))).toBeNull()
  })
})

describe('anchorSelector', () => {
  it('finds a quote again after content is inserted above it', () => {
    page('<p>Intro.</p><p>The answer is 42.</p>')
    const selector = describeRange(rangeOver('answer is 42'), buildTextIndex(document.body))!

    page('<div>A new banner pushed everything down.</div><p>Intro.</p><p>The answer is 42.</p>')
    const index = buildTextIndex(document.body)
    const found = anchorSelector(selector, index)!

    expect(index.text.slice(found.start, found.end)).toBe('answer is 42')
  })

  it('uses the surrounding context to pick between repeated quotes', () => {
    page('<p>red apple, green apple, red apple again</p>')
    const index = buildTextIndex(document.body)
    const second = describeRange(rangeOver('apple', 1), index)!

    // Drop the position hint so only the context can decide.
    const found = anchorSelector({ quote: second.quote }, index)!

    expect(index.text.slice(Math.max(0, found.start - 6), found.start)).toBe('green ')
  })

  it('tolerates changed whitespace', () => {
    page('<p>Line one\n   continues here.</p>')
    const index = buildTextIndex(document.body)

    const found = anchorSelector({ quote: { exact: 'one continues' } }, index)!

    expect(index.text.slice(found.start, found.end)).toBe('one\n   continues')
  })

  it('reports a quote that is no longer on the page', () => {
    page('<p>Completely different text.</p>')

    expect(
      anchorSelector({ quote: { exact: 'the old paragraph' } }, buildTextIndex(document.body)),
    ).toBeNull()
  })
})

describe('offsets and ranges', () => {
  it('round-trips a range across element boundaries', () => {
    page('<p>alpha <b>beta</b> gamma</p>')
    const index = buildTextIndex(document.body)

    const range = offsetsToRange(index, 3, 13)!

    expect(range.toString()).toBe('ha beta ga')
    expect(rangeToOffsets(range, index)).toEqual({ start: 3, end: 13 })
  })

  it('does not start a range at the end of the previous node', () => {
    page('<p>alpha <b>beta</b></p>')
    const index = buildTextIndex(document.body)

    const range = offsetsToRange(index, 6, 10)!

    expect(range.startContainer.textContent).toBe('beta')
    expect(range.toString()).toBe('beta')
  })
})
