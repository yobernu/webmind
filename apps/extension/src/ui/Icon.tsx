import type { SVGProps } from "react";

/**
 * Gloss AI icon set: drawn on a 16px grid, 1.5px strokes, round caps and
 * joins. Kept small and literal; anything decorative belongs in the content.
 */
const PATHS = {
  ask: (
    <path d="M3 4.25c0-.83.67-1.5 1.5-1.5h7c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H8.25L5.5 13v-2.25h-1A1.5 1.5 0 0 1 3 9.25z" />
  ),
  note: (
    <>
      <path d="M10.35 2.9a1.45 1.45 0 0 1 2.05 2.05L6.1 11.25l-2.85.75.75-2.85z" />
      <path d="M8.5 13.25h4.25" />
    </>
  ),
  highlight: (
    <>
      <path d="M9.6 2.6 13.4 6.4 8.15 11.65 4.35 7.85z" />
      <path d="M4.35 7.85 2.75 12.5l1.25.75 4.15-1.6" />
      <path d="M9.75 13.25h3.5" />
    </>
  ),
  history: (
    <>
      <path d="M2.85 8.6A5.25 5.25 0 1 0 4.4 4.2" />
      <path d="M2.75 2.75v2.5h2.5" />
      <path d="M8 5.25V8l1.85 1.35" />
    </>
  ),
  search: (
    <>
      <circle cx="7.1" cy="7.1" r="4.35" />
      <path d="m10.35 10.35 2.9 2.9" />
    </>
  ),
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="3.75" cy="8" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="12.25" cy="8" r="1.1" />
    </g>
  ),
  close: <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />,
  trash: (
    <>
      <path d="M2.75 4.5h10.5" />
      <path d="M6.25 4.5V3.25h3.5V4.5" />
      <path d="m4.25 4.5.6 8.2c.04.53.48.95 1.01.95h4.28c.53 0 .97-.42 1.01-.95l.6-8.2" />
    </>
  ),
  edit: (
    <>
      <path d="M10.35 2.9a1.45 1.45 0 0 1 2.05 2.05L5.6 11.75l-2.85.75.75-2.85z" />
      <path d="m9.25 4 2.75 2.75" />
    </>
  ),
  external: (
    <>
      <path d="M9.25 2.75h4v4" />
      <path d="M13.25 2.75 7.75 8.25" />
      <path d="M11.75 9.75v2.5c0 .55-.45 1-1 1h-7c-.55 0-1-.45-1-1v-7c0-.55.45-1 1-1h2.5" />
    </>
  ),
  send: (
    <>
      <path d="M8 13V3.5" />
      <path d="M4 7.25 8 3.25l4 4" />
    </>
  ),
  stop: <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.25" fill="currentColor" stroke="none" />,
  check: <path d="m3.25 8.5 3 3 6.5-7" />,
  chevron: <path d="M4.25 6.25 8 10l3.75-3.75" />,
  back: <path d="M9.75 3.75 5.5 8l4.25 4.25" />,
  settings: (
    <>
      <path d="M2.75 5h6.25m3 0h1.25M2.75 11H4m3 0h6.25" />
      <circle cx="10.5" cy="5" r="1.5" />
      <circle cx="5.5" cy="11" r="1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.25" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  signOut: (
    <>
      <path d="M6.5 13.25H4c-.69 0-1.25-.56-1.25-1.25V4c0-.69.56-1.25 1.25-1.25h2.5" />
      <path d="m10.25 5 3 3-3 3" />
      <path d="M13.25 8h-6.5" />
    </>
  ),
  key: (
    <>
      <circle cx="5.5" cy="10.5" r="2.75" />
      <path d="m7.45 8.55 5.3-5.3" />
      <path d="m10.75 5.25 1.75 1.75" />
    </>
  ),
  retry: (
    <>
      <path d="M12.9 8.6A4.9 4.9 0 1 1 11.45 4.5" />
      <path d="M12.75 2.25V5H10" />
    </>
  ),
  alert: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 5.25V8.5" />
      <circle cx="8" cy="10.75" r="0.6" fill="currentColor" />
    </>
  ),
  quote: (
    <path
      d="M4.25 11.5c-.9 0-1.5-.75-1.5-1.75 0-1.9 1.25-3.75 3-4.5l.45.7c-1 .6-1.6 1.45-1.7 2.3.95 0 1.65.65 1.65 1.6s-.8 1.65-1.9 1.65zm5.5 0c-.9 0-1.5-.75-1.5-1.75 0-1.9 1.25-3.75 3-4.5l.45.7c-1 .6-1.6 1.45-1.7 2.3.95 0 1.65.65 1.65 1.6s-.8 1.65-1.9 1.65z"
      fill="currentColor"
      stroke="none"
    />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
