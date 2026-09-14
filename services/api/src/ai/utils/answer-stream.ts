import type { AnswerChunk } from '../providers/ai-provider.interface.js';

/**
 * Marks where a model's final answer begins.
 *
 * Deliberately unlikely to occur in prose, and asked for in the system
 * instruction. A model may think as much as it likes before emitting it.
 */
export const ANSWER_SENTINEL = '<<<ANSWER>>>';

/**
 * Matches the sentinel only at the start of a line, which is how the system
 * instruction asks for it.
 *
 * Anchoring matters: a model reasoning aloud may *mention* the marker
 * mid-sentence ("...write <<<ANSWER>>> on its own, then the answer..."), and
 * cutting there would emit the middle of its scratchpad as the answer. The
 * bracket runs are loose because models miscount them.
 */
const SENTINEL_PATTERN = /(^|\n)[ \t]*<{2,4}ANSWER>{2,4}/;

/**
 * The same marker, but only once the answer's first character proves the
 * marker is complete.
 *
 * A loose bracket run is ambiguous while the stream is still arriving: given
 * `<<<ANSWER>>`, the run may be finished or the last `>` may be in the next
 * SSE frame. Matching eagerly emits that stray `>` as the first character of
 * the answer. Waiting for a character that is neither a bracket nor
 * whitespace costs nothing — there is no answer text to emit until one
 * arrives — and removes the ambiguity entirely.
 */
const SENTINEL_COMPLETE = /(^|\n)[ \t]*<{2,4}ANSWER>{2,4}\s*(?=[^\s>])/;

/**
 * How much may be withheld while waiting for the sentinel.
 *
 * This bounds the cost of a model that never emits one: past this point the
 * filter gives up, releases what it held and streams the rest. Large enough to
 * cover a typical reasoning preamble, small enough that a non-compliant model
 * does not stall the panel indefinitely.
 */
export const MAX_WITHHELD_CHARS = 8_000;

/**
 * Thrown when the contract produced nothing showable.
 *
 * Carries text written for the person who asked, because the generic "the
 * answer could not be completed" would leave them with no idea that a shorter
 * question or a different model is what they need.
 */
export class NoAnswerError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'NoAnswerError';
  }
}

export interface FilterOutcome {
  /** True when the sentinel was seen, i.e. the model honoured the contract. */
  honoured: boolean;
  /** Characters discarded as pre-answer reasoning. */
  discarded: number;
  /** The model hit its output cap rather than choosing to stop. */
  truncated: boolean;
  /**
   * True when text was withheld and then dropped because the generation was
   * cut off before the answer began. The caller has an unfinished preamble and
   * no answer, which is a failure rather than a short reply.
   */
  abandoned: boolean;
}

/**
 * Enforces the output contract: only the final answer reaches the caller.
 *
 * This is the counterpart to PromptBuilderService. That service owns what goes
 * *into* the model; this owns what is allowed *out*. Providers stay pure
 * transport, and the rule lives in one testable place rather than being
 * sprinkled through vendor code or hoped for in a prompt.
 *
 * Behaviour:
 *  - Text before the sentinel is withheld, then discarded once it arrives.
 *  - Without a sentinel, nothing is lost: at end of stream, or once the
 *    withholding budget is exhausted, everything held is released and the rest
 *    passes through untouched. A filter that could swallow an answer would be
 *    worse than the leak it prevents.
 *  - The one exception is a generation the provider reports as truncated
 *    before any sentinel arrived. That is not a short answer, it is an
 *    unfinished preamble, so it is dropped and reported rather than shown.
 *    This relies on the vendor's own finish reason, not on reading the prose.
 *  - The sentinel may straddle chunk boundaries, so matching happens on the
 *    accumulated buffer rather than per chunk.
 */
export async function* extractAnswer(
  source: AsyncIterable<AnswerChunk>,
  onOutcome?: (outcome: FilterOutcome) => void,
): AsyncIterable<string> {
  let buffer = '';
  let streaming = false;
  let discarded = 0;
  // Tracked separately from `discarded`: a compliant model with nothing to
  // think about emits the sentinel first, discarding zero characters.
  let sentinelSeen = false;
  let truncated = false;
  let abandoned = false;

  for await (const event of source) {
    if (event.type === 'finish') {
      truncated = event.reason === 'length';
      continue;
    }

    const chunk = event.text;

    if (streaming) {
      yield chunk;
      continue;
    }

    buffer += chunk;

    const match = SENTINEL_COMPLETE.exec(buffer);

    if (match) {
      // Everything before the marker was the model thinking aloud.
      discarded = match.index;
      sentinelSeen = true;

      const answer = buffer.slice(match.index + match[0].length);

      buffer = '';
      streaming = true;

      yield answer;
      continue;
    }

    // Budget exhausted: stop looking for the sentinel and release everything.
    // Holding back a possible partial sentinel here would drop those
    // characters for good, since nothing revisits the buffer afterwards.
    if (buffer.length > MAX_WITHHELD_CHARS) {
      yield buffer;
      buffer = '';
      streaming = true;
    }
  }

  if (!streaming && buffer) {
    // Nothing more is coming, so an unterminated bracket run is no longer
    // ambiguous and the loose pattern is safe to trust here.
    const trailing = SENTINEL_PATTERN.exec(buffer);

    if (trailing) {
      // A marker with nothing after it means the stream ended before the
      // answer began; there is no answer to salvage, only reasoning to drop.
      discarded = trailing.index;
      sentinelSeen = true;

      const answer = buffer.slice(trailing.index + trailing[0].length).trim();
      if (answer) yield answer;
    } else if (truncated) {
      // Cut off at the output cap with no marker: the model spent its whole
      // budget before reaching an answer. Releasing this would show a wall of
      // deliberation in place of a reply, which is the failure this filter
      // exists to prevent, and it is not a reply the caller would want anyway.
      discarded = buffer.length;
      abandoned = true;
    } else {
      // No marker at all: release what was held rather than returning nothing.
      yield buffer;
    }
  }

  onOutcome?.({ honoured: sentinelSeen, discarded, truncated, abandoned });
}
