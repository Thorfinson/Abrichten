import type { JSX } from 'react'

/**
 * One consistent stroke icon set (24 × 24, round caps) for the app chrome.
 * Inline SVG — no icon dependency. Colour follows `currentColor`.
 */
const ICONS = {
  // Chrome
  sidebar: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  settings: <>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  panels: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  quad: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6" /></>,

  // Canvas tools
  select: <><path d="m4 4 7.07 16.97 2.51-7.39 7.39-2.51z" /><path d="m13.5 13.5 6 6" /></>,
  measure: <>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z" />
    <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
  </>,
  angle: <><path d="M4 20h16M4 20 14 5" /><path d="M11 20a7 7 0 0 0-3.12-5.82" /></>,
  area: <><path d="M5 19 4 8l9-4 7 7-4 8z" /><path d="m8.5 15 5-5M11 16.5l3.5-3.5" /></>,

  // Scene / canvas state
  magnet: <><path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" /><path d="m5 8 4 4M12 15l4 4" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></>,
  rotate: <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,

  // Panel hub
  cabinet: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M12 3v18M9.5 11v2M14.5 11v2" /></>,
  drawer: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 12h18M10 8h4M10 16h4" /></>,
  hinge: <><circle cx="8" cy="12" r="4" /><path d="M12 10.5h7.5a1.5 1.5 0 0 1 0 3H12" /></>,
  tolerance: <><path d="M4 5v14M20 5v14M7 12h10" /><path d="m9.5 9.5-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5" /></>,
  parameters: <>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
    <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  </>,
  materials: <><path d="M12 2 2 7l10 5 10-5z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  statics: <><path d="M3 9c6 5 12 5 18 0" /><path d="M12 2v6M9.5 5.5 12 8l2.5-2.5" /><path d="M3 9 1 13h4zM21 9l-2 4h4z" /></>,
  collision: <><rect x="3" y="3" width="12" height="12" rx="1.5" /><rect x="9" y="9" width="12" height="12" rx="1.5" /></>,
  nesting: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 12h10M13 4v16M13 9h8" /></>,
  boring: <><rect x="3" y="7" width="18" height="10" rx="1.5" /><circle cx="7.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="16.5" cy="12" r="1.5" /></>,
  hardware: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  cost: <><path d="M4 10h12M4 14h9" /><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" /></>,
  assembly: <><path d="M10 6h11M10 12h11M10 18h11" /><path d="M4 4.5 5.5 4v4.5M4 8.5h3M4 14.2c.3-.6 1-.9 1.6-.7.8.3.9 1.2.3 1.8L4 17.5h3" /></>,
  drawings: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" /></>,
  ai: <><path d="m12 3 1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="m19 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>
} satisfies Record<string, JSX.Element>

export type IconName = keyof typeof ICONS

interface IconProps {
  name: IconName
  /** Tailwind size classes; defaults to 16 px */
  className?: string
  strokeWidth?: number
}

export function Icon({ name, className = 'w-4 h-4', strokeWidth = 1.75 }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
