import { describe, expect, it } from 'vitest'
import {
  MAX_QUESTION_LENGTH,
  MAX_QUOTE_LENGTH,
  composeQuestion,
  questionBudget,
  splitQuestion,
  trimQuote,
} from './quote'

describe('quoted questions', () => {
  it('round-trips a passage and its question', () => {
    const text = composeQuestion('  Why does it resolve?  ', 'returns a promise')

    expect(text).toBe('“returns a promise”\n\nWhy does it resolve?')
    expect(splitQuestion(text)).toEqual({
      quote: 'returns a promise',
      question: 'Why does it resolve?',
    })
  })

  it('leaves a plain question alone', () => {
    expect(composeQuestion('What is this?', null)).toBe('What is this?')
    expect(splitQuestion('“Quoted” but not a passage')).toEqual({
      quote: null,
      question: '“Quoted” but not a passage',
    })
  })

  it('keeps a multi-line passage intact', () => {
    const text = composeQuestion('Explain', 'line one\nline two')
    expect(splitQuestion(text).quote).toBe('line one\nline two')
  })

  it('collapses whitespace and caps the quote length', () => {
    expect(trimQuote('  a \n\n b  ')).toBe('a b')
    const long = trimQuote('x'.repeat(5_000))
    expect(long).toHaveLength(MAX_QUOTE_LENGTH)
    expect(long.endsWith('…')).toBe(true)
  })

  it('counts the attached quote against the question limit', () => {
    expect(questionBudget(null)).toBe(MAX_QUESTION_LENGTH)
    expect(questionBudget('abcd')).toBe(MAX_QUESTION_LENGTH - 8)
  })
})
