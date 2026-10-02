import { MARK, WORDMARK_AI, WORDMARK_GLOSS, WORDMARK_RATIO, WORDMARK_VIEWBOX } from "./paths";

/** The bare mark: Newsreader "g" in the current text colour over the
 * highlighter swipe. Outlined, so it never waits for the web font. */
export function BrandMark({ size = 20, title }: { size?: number; title?: string }) {
  const { swipe } = MARK;
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK.viewBox}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="brand-mark"
    >
      <rect
        x={swipe.x}
        y={swipe.y}
        width={swipe.w}
        height={swipe.h}
        transform={`rotate(-6 ${swipe.cx} ${swipe.cy})`}
        fill="var(--color-highlight)"
      />
      <path fill="currentColor" transform={MARK.glyph.transform} d={MARK.glyph.d} />
    </svg>
  );
}

/** "gloss AI", sized by height. */
export function Wordmark({ height = 18, title = "Gloss AI" }: { height?: number; title?: string }) {
  return (
    <svg
      height={height}
      width={height * WORDMARK_RATIO}
      viewBox={WORDMARK_VIEWBOX}
      role="img"
      aria-label={title}
      className="brand-wordmark"
    >
      <path fill="currentColor" d={WORDMARK_GLOSS} />
      <g fill="var(--color-text-2)">
        {WORDMARK_AI.map((letter) => (
          <path key={letter.transform} transform={letter.transform} d={letter.d} />
        ))}
      </g>
    </svg>
  );
}

/** Mark and wordmark side by side, as in the panel header. */
export function BrandLockup({ height = 18 }: { height?: number }) {
  return (
    <span className="brand-lockup">
      <BrandMark size={Math.round(height * 1.15)} />
      <Wordmark height={height} />
    </span>
  );
}
