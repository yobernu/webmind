/** Keeps a quoted selection from crowding out the question itself. */
export const MAX_QUOTE_LENGTH = 1_200;

/** Matches the API's MAX_QUESTION_LENGTH. */
export const MAX_QUESTION_LENGTH = 4_000;

export function trimQuote(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_QUOTE_LENGTH
    ? `${collapsed.slice(0, MAX_QUOTE_LENGTH - 1)}…`
    : collapsed;
}

/**
 * A question about a passage travels as plain text, "“passage”\n\nquestion",
 * so the API and stored history need no new fields.
 */
export function composeQuestion(question: string, quote: string | null): string {
  const asked = question.trim();
  return quote ? `“${quote}”\n\n${asked}` : asked;
}

/** Splits a stored question back into its quoted passage and the question. */
export function splitQuestion(text: string): { quote: string | null; question: string } {
  const match = /^“([\s\S]+?)”\n\n([\s\S]*)$/.exec(text);
  return match ? { quote: match[1], question: match[2] } : { quote: null, question: text };
}

/** Characters left for the question once the quote is attached. */
export function questionBudget(quote: string | null): number {
  return MAX_QUESTION_LENGTH - (quote ? quote.length + 4 : 0);
}
