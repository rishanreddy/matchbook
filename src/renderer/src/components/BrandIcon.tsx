import type { ReactElement } from 'react'

type BrandIconProps = {
  size?: number
  /** Colour of the cover outline and the match sticks. */
  color?: string
  /** Colour of the strike strip. */
  accentColor?: string
  strokeWidth?: number
}

/**
 * The Matchbook mark: a matchbook cover holding three matches above an amber
 * strike strip. Three matches because an FRC alliance is three robots.
 *
 * Drawn on a 32-unit grid so the 2px strokes land on whole pixels at 32px and
 * 16px, which is where it is used most (title bar, splash, about dialog).
 */
export function BrandIcon({
  size = 24,
  color = 'currentColor',
  accentColor = 'var(--accent, #ffb020)',
  strokeWidth = 2,
}: BrandIconProps): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="2.5"
        width="22"
        height="27"
        rx="3.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <path d="M6 23.5h20" stroke={accentColor} strokeWidth={strokeWidth * 2.1} />
      <g stroke={color} strokeWidth={strokeWidth * 1.05} strokeLinecap="round">
        <path d="M10.8 20.5v-9" />
        <path d="M16 20.5v-9" />
        <path d="M21.2 20.5v-9" />
      </g>
      <g fill={color}>
        <circle cx="10.8" cy="9.6" r={strokeWidth * 0.925} />
        <circle cx="16" cy="9.6" r={strokeWidth * 0.925} />
        <circle cx="21.2" cy="9.6" r={strokeWidth * 0.925} />
      </g>
    </svg>
  )
}
