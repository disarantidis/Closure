/*
  PieChart — parts of a whole, drawn as a RING. It is the radial sibling of BarChart: the same chrome
  (a legend, a per-slice hover panel, click and select) around a different drawing, because a pie cannot
  be a row of cells. Each slice is a FILLED SVG path — a wedge for a solid pie, an annular sector for a
  donut (a first cut used thick stroke-arcs, the ProgressBar ring's trick, but a stroke has nowhere to
  go at radius 0 and left seams and a notch at the centre; a filled path has a real centre point) —
  coloured by its OWN scheme (`data-scheme` → `--accent`), so no colour is named here, exactly as the
  bar family. The CENTRE is a content slot: the donut's answer to Bar's, a place for the total or a
  label. A partial ring (a `max` larger than the parts) leaves a groove track, the pie's shortfall.

  IT IS A DRAWING, SO ITS COLOUR IS DATA. Like Bar, a chart has no value to derive a tone from — the
  slice colours ARE the categories — so `scheme` per slice is declared, not derived; the "tone is
  derived" rule stays with the semantic gauges (Meter, SegmentMeter) that this is not.
*/
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react'
import { forwardRef, useId, useMemo, useState } from 'react'
import { Popover } from './Popover'
import type { BarScheme } from './Bar'
import { isFloor, recessLevel, useLevel } from './LevelContext'

/* one wedge — its size is the value, its colour its scheme, its name what the legend and hover read */
export type PieSlice = { label: string; value: number; scheme?: BarScheme }

/* which slice was pressed — its place and the datum it drew, so one handler serves every slice */
export type PieClickInfo = { index: number; slice: PieSlice; value: number }

export type PieChartProps = {
  /* REQUIRED — the chart's accessible name; the figure is a `role="img"` and this names it */
  label: string
  labelHidden?: boolean
  data: PieSlice[]
  /* the whole the parts are measured against. Omit and it is their sum (a full ring); give it larger
     than the sum and the ring stops short, the remainder drawn as a groove track — a shortfall */
  max?: number
  /*
    SHOW THE FULL CYCLE — a groove ring behind the slices for the whole 100%, the way ProgressBar keeps
    its track under the fill. A shortfall (a `max` past the sum) draws it anyway; this turns it on
    without one — a single-value ring reads as a gauge, and the gaps between slices sit on the groove
    rather than on the page.
  */
  track?: boolean
  /*
    SEPARATE THE PIECES — an exploded ring: every slice slides OUTWARD along its own bisector, so the
    parts read as distinct pieces with the ground between them rather than one divided disc. A selected
    slice still pops further. Reads best on a solid pie or a chunky donut.
  */
  exploded?: boolean
  /* the diameter in px. Default 200 */
  size?: number
  /*
    THE RING WIDTH, as a fraction of the radius (0..1). `1` is a SOLID pie (the stroke fills to the
    centre); less is a DONUT with a hole. Left unset it is a solid pie, UNLESS `center` content is given
    — then it opens to a donut so the hole can hold it.
  */
  thickness?: number
  /*
    MAKE EACH SLICE ITS OWN TARGET — the radial counterpart of BarChart's `onBarClick`. Given it, every
    slice is a `role="button"` with its own name and keyboard handling (Enter/Space), reporting which
    one it was. Omit it and the slices are a drawing.
  */
  onSliceClick?: (info: PieClickInfo) => void
  /* which slices are SELECTED — each pops outward, the ring's version of the bar's stroke */
  selectedSlices?: number[]
  /* a hover panel on each slice — swatch, name, value and its share. On by default */
  tooltip?: boolean
  showLegend?: boolean
  /* how a value reads. Default rounds to a whole number */
  formatValue?: (value: number) => string
  /* content laid in the donut's HOLE — a total, a label. Turns a solid pie into a donut when set */
  center?: ReactNode
  /*
    THE GAP BETWEEN SLICES, in the pathLength-100 units the arcs are measured in (1 = 3.6°). DEFAULT 0,
    so the arcs are EXACTLY proportional and the cycle closes to the pixel — a gap steals a constant from
    every slice, which reads as error, worst on the small ones. Set a small value for a visual break; it
    is applied SYMMETRICALLY (half off each end) so a slice's MIDPOINT stays true, and clamped so a tiny
    slice never vanishes. For separation without any distortion, use `exploded` instead.
  */
  gap?: number
  style?: CSSProperties
}

const defaultFormat = (v: number) => String(Math.round(v))
/* the outer radius, a hair under 50 so a popped-out selected slice still clears the box */
const R_OUT = 47

export const PieChart = forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  {
    label,
    labelHidden = false,
    data,
    max,
    track,
    exploded,
    gap = 0,
    size = 200,
    thickness,
    onSliceClick,
    selectedSlices,
    tooltip = true,
    showLegend = true,
    formatValue = defaultFormat,
    center,
    style,
  },
  ref
) {
  const id = useId()
  const sum = data.reduce((t, s) => t + Math.max(0, s.value), 0)
  const total = Math.max(1, max ?? sum)
  /* solid pie by default; a donut when there is a centre to show through the hole. Slices are FILLED
     WEDGES (paths), so the outer edge and the hole are radii, not a thick stroke that would degenerate
     to a point at the centre and leave seams there — the bug the stroke version had. */
  const t = Math.max(0.02, Math.min(1, thickness ?? (center != null ? 0.62 : 1)))
  const rOut = R_OUT
  const rIn = rOut * (1 - t)

  /* a point on the ring at `deg` degrees CLOCKWISE FROM THE TOP, radius `rad` — the drawing's whole
     trigonometry, so the arcs are exact and nothing needs a group rotation to start at twelve o'clock */
  const pt = (deg: number, rad: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180
    return [+(50 + rad * Math.cos(a)).toFixed(3), +(50 + rad * Math.sin(a)).toFixed(3)]
  }

  /* the slices as angles — cumulative degrees, so each begins where the last ended, summing to 360 */
  let acc = 0
  const slices = data.map((s, i) => {
    const frac = total > 0 ? Math.max(0, s.value) / total : 0
    const start = acc
    acc += frac
    return { slice: s, i, frac, a0: start * 360, a1: (start + frac) * 360 }
  })

  const interactive = onSliceClick != null
  const [hot, setHot] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<SVGPathElement | null>(null)
  /* a fresh anchor object whenever the raised slice changes, so the one popover re-places from slice to
     slice — the kit Popover re-runs place() when its anchorRef identity moves (as the linked table does) */
  const anchorRef = useMemo(() => ({ current: anchor as unknown as HTMLElement | null }) as RefObject<HTMLElement>, [anchor])
  const shown = hot != null ? slices[hot] : null
  const raise = (i: number, el: SVGPathElement) => {
    setHot(i)
    setAnchor(el)
  }

  const legend: ReactNode = showLegend && data.some((s) => s.label) && (
    <div className="nd-pie-legend">
      {data.map((s, i) => (
        <span className="nd-pie-legend-item" key={i}>
          <span className="nd-pie-swatch" {...(s.scheme ? { 'data-scheme': s.scheme } : {})} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  )

  /* the WHOLE-RING path (a lone full slice, or the shortfall track) — two half-arcs, plus the hole as a
     reverse pair so `fill-rule: evenodd` cuts it out */
  const ringPath = (): string => {
    const outer = `M ${pt(0, rOut).join(' ')} A ${rOut} ${rOut} 0 1 1 ${pt(180, rOut).join(' ')} A ${rOut} ${rOut} 0 1 1 ${pt(0, rOut).join(' ')} Z`
    if (rIn <= 0.01) return outer
    return `${outer} M ${pt(0, rIn).join(' ')} A ${rIn} ${rIn} 0 1 0 ${pt(180, rIn).join(' ')} A ${rIn} ${rIn} 0 1 0 ${pt(0, rIn).join(' ')} Z`
  }

  const arc = (s: (typeof slices)[number]): ReactNode => {
    const sel = selectedSlices?.includes(s.i) ?? false
    const span = s.a1 - s.a0
    /* the gap, applied SYMMETRICALLY (half off each end) so the slice's midpoint stays true, and clamped
       to a third of the span so a small slice never vanishes. At the default gap 0 the wedge is exactly
       its share. `gap` is in pathLength-100 units; 1 = 3.6°. */
    const gapDeg = Math.min(Math.max(0, gap) * 3.6, span * 0.34)
    const a0 = s.a0 + gapDeg / 2
    const a1 = s.a1 - gapDeg / 2
    const full = span >= 359.999
    const large = a1 - a0 > 180 ? 1 : 0
    let d: string
    if (full) {
      d = ringPath()
    } else if (rIn <= 0.01) {
      /* a solid WEDGE: centre → outer arc → back to centre */
      d = `M 50 50 L ${pt(a0, rOut).join(' ')} A ${rOut} ${rOut} 0 ${large} 1 ${pt(a1, rOut).join(' ')} Z`
    } else {
      /* an ANNULAR SECTOR: outer arc, in to the hole, inner arc back */
      d = `M ${pt(a0, rOut).join(' ')} A ${rOut} ${rOut} 0 ${large} 1 ${pt(a1, rOut).join(' ')} L ${pt(a1, rIn).join(' ')} A ${rIn} ${rIn} 0 ${large} 0 ${pt(a0, rIn).join(' ')} Z`
    }
    const name = `${s.slice.label}, ${formatValue(s.slice.value)}`
    /* EXPLODE + POP as one transform: the slice slides OUTWARD along its bisector (its true midpoint
       angle), further when selected. Both are a translate, so they compose and the CSS transition
       animates them; a size change, never colour alone (WCAG 1.4.1). */
    const dist = (exploded ? 3.5 : 0) + (sel ? 3.5 : 0)
    const [ux, uy] = pt((s.a0 + s.a1) / 2, 1)
    const dx = (ux - 50) * dist
    const dy = (uy - 50) * dist
    const transform = dist ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : undefined
    const common = {
      className: `nd-pie-slice${sel ? ' is-selected' : ''}`,
      d,
      ...(full && rIn > 0.01 ? { fillRule: 'evenodd' as const } : {}),
      ...(transform ? { style: { transform } as CSSProperties } : {}),
      ...(s.slice.scheme ? { 'data-scheme': s.slice.scheme } : {}),
    }
    const hover = tooltip
      ? {
          onMouseEnter: (e: { currentTarget: SVGPathElement }) => raise(s.i, e.currentTarget),
          onMouseLeave: () => setHot(null),
          onFocus: (e: { currentTarget: SVGPathElement }) => raise(s.i, e.currentTarget),
          onBlur: () => setHot(null),
        }
      : {}
    return interactive ? (
      <path
        key={s.i}
        {...common}
        role="button"
        tabIndex={0}
        aria-label={name}
        {...(selectedSlices != null ? { 'aria-pressed': sel } : {})}
        onClick={() => onSliceClick!({ index: s.i, slice: s.slice, value: s.slice.value })}
        onKeyDown={(e: KeyboardEvent<SVGPathElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSliceClick!({ index: s.i, slice: s.slice, value: s.slice.value })
          }
        }}
        {...hover}
      />
    ) : (
      <path key={s.i} {...common} aria-hidden="true" {...hover} />
    )
  }

  return (
    <div
      ref={ref}
      className="nd-pie"
      /*
        THE TRACK RING IS A GROOVE — `.nd-pie-track` paints `fill: var(--nd-groove)`, and
        `--nd-groove` lives only under `[data-fill]`. Without the attribute the fill is invalid
        at computed-value time and the shortfall ring draws nothing, so a chart that is short of
        its `max` showed no shortfall. Meter's recipe, including the floor case.
      */
      data-fill={isFloor(useLevel()) ? undefined : recessLevel(useLevel())}
      data-floor={isFloor(useLevel()) || undefined}
      style={{ ['--nd-pie-size' as string]: `${size}px`, ...style }}
    >
      {!labelHidden && (
        <div className="nd-pie-head" id={id}>
          {label}
        </div>
      )}
      {legend}
      <div className="nd-pie-figure">
        <svg className="nd-pie-svg" viewBox="0 0 100 100" role="img" aria-label={label} {...(labelHidden ? {} : { 'aria-labelledby': id })}>
          {(track || (max != null && max > sum)) && <path className="nd-pie-track" d={ringPath()} {...(rIn > 0.01 ? { fillRule: 'evenodd' as const } : {})} aria-hidden="true" />}
          {slices.map(arc)}
        </svg>
        {center != null && <div className="nd-pie-centre">{center}</div>}
      </div>
      {tooltip && (
        <Popover open={shown != null} onClose={() => setHot(null)} anchorRef={anchorRef} side="top" size="small" className="nd-pie-tip">
          {shown && (
            <div className="nd-pie-tip-body">
              <span className="nd-pie-swatch" {...(shown.slice.scheme ? { 'data-scheme': shown.slice.scheme } : {})} aria-hidden="true" />
              <span className="nd-pie-tip-label">{shown.slice.label}</span>
              <span className="nd-pie-tip-value">
                {formatValue(shown.slice.value)} · {Math.round(shown.frac * 100)}%
              </span>
            </div>
          )}
        </Popover>
      )}
    </div>
  )
})
