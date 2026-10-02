/**
 * Where a highlight sits in the page, in the shape of the W3C Web Annotation
 * selectors. The quote is what re-anchoring relies on; the position is only a
 * hint for choosing between repeated quotes, since it shifts whenever the page
 * changes above the passage.
 */
export interface TextQuoteSelector {
  exact: string;
  /** Text just before the passage, to tell repeated quotes apart. */
  prefix?: string;
  /** Text just after the passage. */
  suffix?: string;
}

export interface TextPositionSelector {
  /** Character offsets into the page's text content. */
  start: number;
  end: number;
}

export interface HighlightSelector {
  quote: TextQuoteSelector;
  position?: TextPositionSelector;
}
