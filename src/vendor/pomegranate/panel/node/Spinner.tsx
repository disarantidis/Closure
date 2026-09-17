/*
  Spinner — the swirling loader, for work that is happening rather than pending.

  ONE ARC, TWO TIMINGS. The arc breathes open and closed on one cycle and turns on
  another a third longer, so the two never resynchronise and the motion reads as a
  swirl rather than a rotating gap. A single-timing spinner is a wheel; this is the
  cheapest way to make waiting look like activity without adding a second element.

  THE STROKE IS THE ACCENT (`--accent`), which is why it belongs to the kit and not
  to a call site: put it inside `data-scheme="error"` and it repaints with every
  other accent-bearing thing in that scheme, exactly the way the Button's `primary`
  does. `currentColor` is deliberately NOT used — inheriting text colour would make
  the loader a different colour in every row it landed in.

  `pathLength={800}` normalises the circle's circumference, so the dash keyframes
  in node.css are one set of numbers that hold at any size or stroke width — the
  arc is the same fraction of the ring at 14px as at 72px.

  It is presentational: no timers, no state, nothing but the announcement.
*/
export type SpinnerLineCap = 'round' | 'butt' | 'square'

export function Spinner({
  size = 24,
  strokeWidth = 3,
  lineCap = 'round',
  duration = '1.5s',
  label = 'Loading',
}: {
  /** Rendered box in px — the geometry scales with it. */
  size?: number
  /** Boldness of the arc, in the same px scale as `size`. */
  strokeWidth?: number
  /** 'round' for a soft arc, 'butt' for a sharper, mechanical one. */
  lineCap?: SpinnerLineCap
  /** Length of one breath; the turn runs a third slower. */
  duration?: string
  /** Announced to screen readers; pass '' for a decorative spinner beside its own label. */
  label?: string
}) {
  // one viewBox unit = one px at the default size, so strokeWidth reads true
  const r = 12.5 - strokeWidth / 2
  return (
    <svg
      className="nd-spinner"
      width={size}
      height={size}
      viewBox="0 0 25 25"
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ ['--nd-spinner-dur' as string]: duration }}
    >
      <circle
        className="nd-spinner-arc"
        cx="12.5"
        cy="12.5"
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap={lineCap}
        pathLength={800}
      />
    </svg>
  )
}
