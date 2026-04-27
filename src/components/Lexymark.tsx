import type { SVGProps } from 'react';

/**
 * Lexy wordmark glyph — a stylised "L" rendered as a stacked legal indent
 * (paragraph + section bar). Sober, monochrome, currentColor-friendly.
 */
export function Lexymark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M5 4v16h14" />
      <path d="M9 9h7" />
      <path d="M9 14h5" />
    </svg>
  );
}
