import { describe, expect, it } from 'vitest';

import type {
  AnswerChunk,
  FinishReason,
} from '../providers/ai-provider.interface.js';
import {
  ANSWER_SENTINEL,
  extractAnswer,
  MAX_WITHHELD_CHARS,
  type FilterOutcome,
} from './answer-stream.js';

async function* from(
  chunks: string[],
  finish: FinishReason | null = 'stop',
): AsyncIterable<AnswerChunk> {
  for (const chunk of chunks) yield { type: 'text', text: chunk };
  // `null` stands for a stream that ended without the vendor saying why.
  if (finish) yield { type: 'finish', reason: finish };
}

async function run(chunks: string[], finish: FinishReason | null = 'stop') {
  let outcome: FilterOutcome | undefined;
  let text = '';

  for await (const piece of extractAnswer(from(chunks, finish), (result) => {
    outcome = result;
  })) {
    text += piece;
  }

  return { text, outcome };
}

/** The shape the free nvidia model actually produced. */
const SCRATCHPAD = `Here's a thinking process:

1.  **Analyze User Input:**
   - User repeatedly asks: "why i am seeing these errors"
   - I should not invent outside information.

2.  **Formulate Response:**
   - Keep it tight.

`;

describe('extractAnswer', () => {
  it('drops everything before the sentinel', async () => {
    const { text } = await run([
      SCRATCHPAD,
      `${ANSWER_SENTINEL}\n`,
      'The page lists two missing CNAME records.',
    ]);

    expect(text).toBe('The page lists two missing CNAME records.');
    expect(text).not.toContain('thinking process');
  });

  it('reports that the contract was honoured, and how much was dropped', async () => {
    const { outcome } = await run([SCRATCHPAD + ANSWER_SENTINEL + 'Answer.']);

    expect(outcome?.honoured).toBe(true);
    // The newline that puts the marker on its own line belongs to the marker,
    // so it is counted with it rather than with the discarded reasoning.
    expect(outcome?.discarded).toBe(SCRATCHPAD.length - 1);
  });

  it('handles a model that answers immediately with no preamble', async () => {
    const { text, outcome } = await run([`${ANSWER_SENTINEL}Straight to it.`]);

    expect(text).toBe('Straight to it.');
    expect(outcome?.honoured).toBe(true);
    expect(outcome?.discarded).toBe(0);
  });

  it('matches a sentinel split across chunk boundaries', async () => {
    // The sentinel arrives one character at a time, as it would over SSE.
    const chunks = ['thinking...\n', ...ANSWER_SENTINEL.split(''), '\nAnswer.'];

    const { text } = await run(chunks);

    expect(text).toBe('Answer.');
  });

  it('never emits the sentinel itself', async () => {
    const { text } = await run([`${SCRATCHPAD}${ANSWER_SENTINEL}Answer.`]);

    expect(text).not.toContain(ANSWER_SENTINEL);
    expect(text).not.toContain('<<<');
  });

  it('streams the answer incrementally once the sentinel has passed', async () => {
    const pieces: string[] = [];

    for await (const piece of extractAnswer(
      from([ANSWER_SENTINEL, 'one ', 'two ', 'three']),
    )) {
      pieces.push(piece);
    }

    // Not buffered into a single lump: the panel still sees it arrive.
    expect(pieces).toEqual(['one ', 'two ', 'three']);
  });

  it('passes everything through when no sentinel ever arrives', async () => {
    // Losing an answer would be worse than the leak this prevents.
    const { text, outcome } = await run(['A plain ', 'answer with no marker.']);

    expect(text).toBe('A plain answer with no marker.');
    expect(outcome?.honoured).toBe(false);
  });

  it('gives up withholding once the budget is exhausted', async () => {
    const long = 'x'.repeat(MAX_WITHHELD_CHARS + 500);

    const { text, outcome } = await run([long, ' tail']);

    expect(text).toBe(`${long} tail`);
    expect(outcome?.honoured).toBe(false);
  });

  it('still finds a sentinel that arrives before the budget runs out', async () => {
    const nearlyBudget = `${'x'.repeat(MAX_WITHHELD_CHARS - 100)}\n`;

    const { text } = await run([nearlyBudget, `${ANSWER_SENTINEL}\n`, 'Answer.']);

    expect(text).toBe('Answer.');
  });

  it('emits nothing for an empty stream', async () => {
    const { text } = await run([]);

    expect(text).toBe('');
  });

  it('trims the whitespace a model leaves after the marker', async () => {
    const { text } = await run([`${ANSWER_SENTINEL}\n\n  Answer.`]);

    expect(text).toBe('Answer.');
  });

  it('leaves a later sentinel-like string in the answer alone', async () => {
    const { text } = await run([
      `${ANSWER_SENTINEL}Write ${ANSWER_SENTINEL} to mark an answer.`,
    ]);

    // Only the first occurrence is structural; the rest is content.
    expect(text).toBe(`Write ${ANSWER_SENTINEL} to mark an answer.`);
  });
});

describe('extractAnswer sentinel anchoring', () => {
  it('ignores the marker mentioned mid-sentence while reasoning', async () => {
    // Observed with a real model: it narrated the instruction back to itself.
    // Cutting on that emitted the middle of its scratchpad as the answer.
    const { text, outcome } = await run([
      `I should write ${ANSWER_SENTINEL} on its own line, then answer.\n`,
      `${ANSWER_SENTINEL}\n`,
      'The real answer.',
    ]);

    expect(text).toBe('The real answer.');
    expect(outcome?.honoured).toBe(true);
  });

  it('accepts a marker indented on its own line', async () => {
    const { text } = await run([`thinking\n   ${ANSWER_SENTINEL}\nAnswer.`]);

    expect(text).toBe('Answer.');
  });

  it('accepts a miscounted bracket run', async () => {
    // Models drop or add angle brackets; the answer should not depend on it.
    const { text } = await run(['thinking\n<<ANSWER>>>>\nAnswer.']);

    expect(text).toBe('Answer.');
  });

  it('does not leak a bracket while the marker is still arriving', async () => {
    // `<<<ANSWER>>` is a legal loose marker on its own, so matching it as soon
    // as it appears emits the trailing `>` as the answer's first character.
    const { text } = await run(['thinking\n<<<ANSWER>>', '>\nAnswer.']);

    expect(text).toBe('Answer.');
  });

  it('drops the reasoning when the stream ends right after the marker', async () => {
    const { text, outcome } = await run([`thinking\n${ANSWER_SENTINEL}\n`]);

    expect(text).toBe('');
    expect(outcome?.honoured).toBe(true);
  });

  it('treats a marker only ever mentioned inline as no marker at all', async () => {
    const { text, outcome } = await run([
      `Plain prose that mentions ${ANSWER_SENTINEL} in passing.`,
    ]);

    expect(text).toBe(`Plain prose that mentions ${ANSWER_SENTINEL} in passing.`);
    expect(outcome?.honoured).toBe(false);
  });
});

describe('extractAnswer truncation', () => {
  it('drops a preamble that was cut off before any answer', async () => {
    // Observed live: the model spent its entire output budget deliberating and
    // was cut at the cap, so there is no answer to salvage — only reasoning.
    const { text, outcome } = await run([SCRATCHPAD], 'length');

    expect(text).toBe('');
    expect(outcome?.abandoned).toBe(true);
    expect(outcome?.truncated).toBe(true);
    expect(outcome?.discarded).toBe(SCRATCHPAD.length);
  });

  it('keeps a truncated answer that got past the marker', async () => {
    // Cut off mid-answer is still an answer; only the no-answer case is a
    // failure.
    const { text, outcome } = await run(
      [`${SCRATCHPAD}${ANSWER_SENTINEL}\nThe two missing records are`],
      'length',
    );

    expect(text).toBe('The two missing records are');
    expect(outcome?.abandoned).toBe(false);
    expect(outcome?.truncated).toBe(true);
  });

  it('still passes an unmarked answer through when generation completed', async () => {
    // A model that never uses markers must not be silenced just because it
    // produced no marker; only a truncated preamble is dropped.
    const { text, outcome } = await run(['A plain answer.'], 'stop');

    expect(text).toBe('A plain answer.');
    expect(outcome?.abandoned).toBe(false);
  });

  it('passes text through when the vendor never says why it stopped', async () => {
    const { text, outcome } = await run(['A plain answer.'], null);

    expect(text).toBe('A plain answer.');
    expect(outcome?.truncated).toBe(false);
    expect(outcome?.abandoned).toBe(false);
  });

  it('does not drop text already released once the budget ran out', async () => {
    // Past the budget the text is already with the caller, so a late
    // truncation cannot un-send it; reporting it as abandoned would be a lie.
    const long = 'x'.repeat(MAX_WITHHELD_CHARS + 500);

    const { text, outcome } = await run([long], 'length');

    expect(text).toBe(long);
    expect(outcome?.abandoned).toBe(false);
  });
});
