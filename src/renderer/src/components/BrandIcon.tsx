import type { ReactElement } from 'react'

type BrandIconProps = {
  size?: number
  color?: string
  accentColor?: string
  strokeWidth?: number
}

export function BrandIcon({
  size = 24,
  color = 'currentColor',
  accentColor = 'currentColor',
  strokeWidth = 2,
}: BrandIconProps): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 7.5C6.52 6.82 8.49 6.82 10.4 7.5V17.15C8.47 16.49 6.5 16.49 4.5 17.15V7.5Z"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 7.5C17.48 6.82 15.51 6.82 13.6 7.5V17.15C15.53 16.49 17.5 16.49 19.5 17.15V7.5Z"
        fill={color}
        fillOpacity="0.1"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7.35V17.4"
        stroke={color}
        strokeOpacity="0.62"
        strokeWidth={strokeWidth * 0.9}
        strokeLinecap="round"
      />
      <path
        d="M8.2 12.3L10.2 14.22L15.4 9.12"
        stroke={color}
        strokeWidth={strokeWidth * 0.95}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.05 5.35A2.45 2.45 0 0 1 13.95 5.35"
        stroke={accentColor}
        strokeWidth={strokeWidth * 0.85}
        strokeLinecap="round"
      />
      <circle cx="12" cy="3.7" r="1.1" fill={accentColor} />
    </svg>
  )
}
