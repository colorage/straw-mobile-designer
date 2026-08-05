/** Compact SVG icons for the floating designer HUD. */

type IconProps = {
  className?: string
  title?: string
}

export function PlusIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1Z"
      />
    </svg>
  )
}

export function TriangleIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M12 5.5 19.5 18.5h-15L12 5.5Z"
      />
    </svg>
  )
}

export function SquareIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        rx="0.5"
      />
    </svg>
  )
}

export function PyramidIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M12 4.5 20 18.5H4L12 4.5Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.75" d="M12 4.5v14" />
    </svg>
  )
}

export function OctahedronIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M12 3.5 19.5 12 12 20.5 4.5 12 12 3.5Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.75" d="M4.5 12h15" />
    </svg>
  )
}

export function SelectIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M6.2 3.4a1 1 0 0 1 1.1.15l11.2 10.2a1 1 0 0 1-.55 1.72l-4.15.4 2.05 4.55a1 1 0 0 1-1.82.82l-2.1-4.65-2.85 2.55A1 1 0 0 1 7 18.1V4.4a1 1 0 0 1-.8-1Z"
      />
    </svg>
  )
}

export function ScissorsIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <circle cx="7" cy="7" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="7" cy="17" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        d="m9 8.5 10 8M9 15.5l10-8"
      />
    </svg>
  )
}

export function UndoIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.5 8.5H5v-3.5M5.5 8A7 7 0 1 1 5 12"
      />
    </svg>
  )
}

export function RedoIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.5 8.5H19v-3.5M18.5 8A7 7 0 1 0 19 12"
      />
    </svg>
  )
}

export function GridIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        d="M4.5 11h5c.83 0 1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5h-5C3.67 3 3 3.67 3 4.5v5c0 .83.67 1.5 1.5 1.5M5 5h4v4H5zm14.5-2h-5c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5M19 9h-4V5h4zM4.5 21h5c.83 0 1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5h-5c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5m.5-6h4v4H5zm14.5-2h-5c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5h5c.83 0 1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5m-.5 6h-4v-4h4z"
      />
    </svg>
  )
}

export function SunIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        d="M12 3.5v2.25M12 18.25V20.5M3.5 12h2.25M18.25 12H20.5M6.05 6.05l1.6 1.6M16.35 16.35l1.6 1.6M6.05 17.95l1.6-1.6M16.35 7.65l1.6-1.6"
      />
    </svg>
  )
}

export function MoonIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 14.2A6.75 6.75 0 0 1 9.8 7.5 6.5 6.5 0 1 0 16.5 14.2Z"
      />
    </svg>
  )
}

export function CoffeeIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.5 9h9.5a1.5 1.5 0 0 1 1.5 1.5V14a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V9.5A.5.5 0 0 1 6.5 9Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 10.5h1.25A2.25 2.25 0 0 1 20.5 12.75v0A2.25 2.25 0 0 1 18.25 15H17"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        d="M8 7.5c.4-.7.4-1.4 0-2M11 7.5c.4-.7.4-1.4 0-2M14 7.5c.4-.7.4-1.4 0-2"
      />
    </svg>
  )
}

/** Horseshoe magnet for the connection-scanner toggle. */
export function MagnetIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 4.5v7.25a5 5 0 0 0 10 0V4.5"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        d="M7 4.5H4.75M17 4.5h2.25M7 8.5H4.75M17 8.5h2.25"
      />
    </svg>
  )
}

/** A braced frame with welded corners — closed loops simulated as one rigid piece. */
export function RigidLoopIcon({ className, title }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <rect
        x="5.5"
        y="5.5"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        rx="0.5"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M5.5 5.5 18.5 18.5" />
      <circle cx="5.5" cy="5.5" r="2" fill="currentColor" />
      <circle cx="18.5" cy="5.5" r="2" fill="currentColor" />
      <circle cx="5.5" cy="18.5" r="2" fill="currentColor" />
      <circle cx="18.5" cy="18.5" r="2" fill="currentColor" />
    </svg>
  )
}

