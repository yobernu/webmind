import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Prose } from './Prose'
import { parseBlocks } from './proseParse'

describe('parseBlocks', () => {
  it('splits paragraphs, fenced code and lists', () => {
    const blocks = parseBlocks(
      'First line\nsame paragraph\n\n```js\nconst a = 1\n\nconst b = 2\n```\n- one\n- two\n\n1. first\n2. second',
    )

    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'First line\nsame paragraph' },
      { kind: 'code', text: 'const a = 1\n\nconst b = 2' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
      { kind: 'list', ordered: true, items: ['first', 'second'] },
    ])
  })

  it('keeps an unterminated code fence as code', () => {
    expect(parseBlocks('```\nhalf streamed')).toEqual([{ kind: 'code', text: 'half streamed' }])
  })
})

describe('Prose', () => {
  it('renders inline code and bold without injecting HTML', () => {
    const html = renderToStaticMarkup(
      <Prose text={'Check `res.ok` and **never** trust <script>alert(1)</script>'} />,
    )

    expect(html).toContain('<code>res.ok</code>')
    expect(html).toContain('<strong>never</strong>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
