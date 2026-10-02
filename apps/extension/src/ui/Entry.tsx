import type { ReactNode } from "react";

export type EntryTone = "highlight" | "note" | "conversation" | "muted";

/**
 * The shared row for anything saved against a page. A rail runs down the
 * left margin, as a gloss sits in a book's margin; rows are separated by
 * hairlines instead of being boxed as cards.
 *
 * Actions fade in on hover or keyboard focus, and stay visible while
 * `pinActions` is set (e.g. during a delete confirmation).
 */
export function Entry({
  tone = "note",
  children,
  meta,
  actions,
  pinActions = false,
  focused = false,
  as: Element = "article",
}: {
  tone?: EntryTone;
  children: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  pinActions?: boolean;
  focused?: boolean;
  as?: "article" | "li" | "div";
}) {
  return (
    <Element
      className="entry"
      data-tone={tone}
      data-pinned={pinActions || undefined}
      data-focused={focused || undefined}
    >
      <span className="entry-rail" aria-hidden="true" />
      <div className="entry-main">
        <div className="entry-body">{children}</div>
        {(meta || actions) && (
          <div className="entry-foot">
            {meta && <div className="entry-meta">{meta}</div>}
            {actions && <div className="entry-actions">{actions}</div>}
          </div>
        )}
      </div>
    </Element>
  );
}

export function EntryList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="entry-list" aria-label={label}>
      {children}
    </ul>
  );
}

/** A quoted passage from the page: serif italic with hanging quote marks. */
export function Quote({
  children,
  clamp,
  cite,
}: {
  children: string;
  /** Limits the quote to this many lines. */
  clamp?: number;
  cite?: ReactNode;
}) {
  return (
    <figure className="quote">
      <blockquote
        dir="auto"
        className="quote-text"
        style={clamp ? { WebkitLineClamp: clamp } : undefined}
        data-clamped={clamp ? true : undefined}
      >
        {children}
      </blockquote>
      {cite && <figcaption className="quote-cite">{cite}</figcaption>}
    </figure>
  );
}
