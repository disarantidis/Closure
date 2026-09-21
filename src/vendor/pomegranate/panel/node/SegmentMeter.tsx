/*
  SegmentMeter — a quantity that IS, read as CELLS. It is the MEANING around a Bar: the picture is
  drawn by `Bar` (a standalone row of cells anything can spend — a chart, a tile, a legend), and
  this component wraps that picture in everything a Bar deliberately refuses to carry — a label, a
  threshold-derived tone, the value text, and the platform `<meter>` that makes the reading real to
  assistive tech. The split is the kit's own: Checkbox/Radio/Switch each draw through a
  presentational mark the same way, and `Bar` is that mark for the segmented family.

  IT CARRIES TWO READINGS UNDER ONE DRAWING, chosen by the shape of `segments` — a number is the
  uniform capacity gauge (a battery, credits left), an array is a weighted parts-of-a-whole
  breakdown (a reserve inside a balance). Both are Bar's geometry; what SegmentMeter adds on top is
  the same in either case.

  IT IS STILL METER'S SIBLING. `low`/`high`/`optimum` run through Meter's exported `meterRegion`
  (imported, not retyped — the §25 drift rule) and the region picks a scheme island, no colour
  named here; in weighted mode the thresholds read against the highlighted share of the whole. The
  hidden native `<meter>` holds role/min/max/value and the `<label for>`, and in weighted mode it
  also names the highlighted parts through `aria-valuetext` — the one thing the cells cannot say.

  WHY NOT A `shape` PROP ON METER. A ring and a bar mean the same thing (ProgressBar folded them);
  a count and a position do not. Meter reads a level to the pixel, this reads whole cells — a
  different claim, so a different component. And now the drawing is a THIRD component under both.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { Bar, filledSegments, weightedParts, weightedWhole } from './Bar'
import type { BarSize, BarOrientation, BarPart } from './Bar'
import { meterRegion } from './Meter'
import type { MeterRegion, MeterValueAt } from './Meter'

/* the size and axis are Bar's now — SegmentMeter forwards them to the drawing and sizes its own
   label/slots to match. `filledSegments` and the weighted helpers are Bar's too, imported so the
   `<meter>` value and the "N of M" text read from the same arithmetic the cells are drawn from. */
export type SegmentMeterSize = BarSize
export type SegmentMeterOrientation = BarOrientation
export type SegmentMeterValueAt = MeterValueAt

/* Bar's weighted cell, plus the one thing identity adds over geometry: a `label`, which the bar
   itself has no use for but the `<meter>`'s spoken reading does */
export type SegmentPart = BarPart & { label?: string }

export type SegmentMeterProps = {
  /* REQUIRED, AND USUALLY HIDDEN — a gauge with no name announces a count with no subject */
  label: string
  labelHidden?: boolean
  /* THE READING, in uniform mode. Optional because weighted derives its reading from the parts */
  value?: number
  min?: number
  max?: number
  /* a number of equal cells (uniform), or an array of amounts that size the cells (weighted) */
  segments?: number | Array<number | SegmentPart>
  /* THE THRESHOLDS — they tint the reading through `meterRegion`; in weighted mode against the
     highlighted share of the whole */
  low?: number
  high?: number
  optimum?: number
  /** show the value as text beside the label — the filled/total count (uniform) or the highlighted amount (weighted) by default */
  showValue?: boolean
  formatValue?: (info: { value: number; of: number; weighted: boolean }) => string
  size?: SegmentMeterSize
  orientation?: SegmentMeterOrientation
  /** where the formatted value sits. Ignored unless `showValue` */
  valueAt?: SegmentMeterValueAt
  /* the same four slots Meter carries, live for the same reason — a meter is not a target */
  leading?: ReactNode
  trailing?: ReactNode
  head?: ReactNode
  foot?: ReactNode
  /*
    CONTENT LAID INSIDE THE BAR — an avatar and labels ON the fill, forwarded to the Bar's own slot
    (`children`). The four slots above sit AROUND the bar; this one rides OVER it, so a capacity row
    can wear a face and a value with the fill showing through and switching the ink at its edge. It is
    decoration, exactly as on Bar — the meter's reading still comes from its `<meter>`, not this. It
    wants a chunky rung (`xlarge`/`fill`) to breathe, and horizontal, for the per-region ink to cut.
  */
  barContent?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/*
  THE REGION IS A SCHEME — Meter's table, reused. The good reading gets NO island: painting every
  healthy gauge green teaches a reader to stop seeing green.
*/
const SCHEME: Record<MeterRegion, string | undefined> = {
  optimum: undefined,
  suboptimum: 'warning',
  worst: 'error',
}

const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''

export const SegmentMeter = forwardRef<HTMLDivElement, SegmentMeterProps>(function SegmentMeter(
  {
    label,
    labelHidden = false,
    value,
    min = 0,
    max,
    segments = 5,
    low,
    high,
    optimum,
    showValue = false,
    formatValue,
    size = 'medium',
    orientation = 'horizontal',
    valueAt = 'head',
    leading,
    trailing,
    head,
    foot,
    barContent,
    style,
  },
  ref
) {
  const id = useId()
  const weighted = Array.isArray(segments)

  /*
    THE NUMBERS THIS COMPONENT NEEDS — the `<meter>`'s value/max, the threshold region, the default
    shown text, and (weighted) the names to speak. The Bar redraws the picture from the same
    `segments`; these read from Bar's own exported arithmetic so the two cannot disagree.
  */
  let meterValue: number
  let meterMax: number
  let region: MeterRegion
  let defaultShown: string
  let valueText: string | undefined

  if (weighted) {
    const raw = segments as Array<number | SegmentPart>
    const parts = weightedParts(raw)
    const whole = weightedWhole(parts, max)
    const activeSum = parts.filter((p) => p.active).reduce((t, p) => t + p.amount, 0)
    /* the labels of the highlighted parts — the one thing the cells cannot announce */
    const activeLabels = raw
      .map((s) => (typeof s === 'object' && s.active && s.label ? s.label : null))
      .filter((l): l is string => l != null)
    meterMax = whole || 1
    meterValue = activeSum
    region = meterRegion({ value: activeSum, min, max: meterMax, low, high, optimum })
    defaultShown = `${activeSum} of ${whole}`
    valueText = activeLabels.length ? activeLabels.join(', ') : undefined
  } else {
    const ceiling = max ?? 100
    const cells = Math.max(1, Math.floor(segments as number))
    const v = value ?? 0
    meterMax = ceiling
    meterValue = clamp(v, min, ceiling)
    region = meterRegion({ value: v, min, max: ceiling, low, high, optimum })
    defaultShown = `${filledSegments({ value: v, min, max: ceiling, segments: cells })} of ${cells}`
  }

  const shownValue = showValue ? (formatValue ?? (() => defaultShown))({ value: meterValue, of: meterMax, weighted }) : null

  return (
    <div
      ref={ref}
      className={['nd-segmeter', `s-${size}`, `o-${orientation}`, `v-${valueAt}`, `is-${region}`].join(' ')}
      style={style}
      data-scheme={SCHEME[region]}
    >
      {(!labelHidden || (shownValue != null && valueAt === 'head') || slotted(head)) && (
        <div className="nd-segmeter-head">
          {!labelHidden && (
            <label className="nd-segmeter-label" htmlFor={id}>
              {label}
            </label>
          )}
          {slotted(head) && <span className="nd-segmeter-slot nd-segmeter-slot-head">{head}</span>}
          {shownValue != null && valueAt === 'head' && <span className="nd-segmeter-value">{shownValue}</span>}
        </div>
      )}
      <div className="nd-segmeter-line">
        {slotted(leading) && <span className="nd-segmeter-slot">{leading}</span>}
        {/*
          THE ELEMENT CARRIES THE SEMANTICS AND IS OUT OF SIGHT — Meter's split. AT reads the true
          value (uniform) or the highlighted share and its names (weighted); sighted users read the
          Bar beside it, which is `aria-hidden` because this says all of it.
        */}
        <meter
          className="nd-sr-only"
          id={id}
          {...(labelHidden ? { 'aria-label': label } : {})}
          {...(valueText ? { 'aria-valuetext': valueText } : {})}
          min={min}
          max={meterMax}
          value={meterValue}
          {...(low == null ? {} : { low })}
          {...(high == null ? {} : { high })}
          {...(optimum == null ? {} : { optimum })}
        />
        <Bar
          className="nd-segmeter-bar"
          value={value}
          min={min}
          {...(max == null ? {} : { max })}
          segments={segments}
          size={size}
          orientation={orientation}
        >
          {barContent}
        </Bar>
        {slotted(trailing) && <span className="nd-segmeter-slot">{trailing}</span>}
        {shownValue != null && valueAt === 'inline' && <span className="nd-segmeter-value">{shownValue}</span>}
      </div>
      {(slotted(foot) || (shownValue != null && valueAt === 'foot')) && (
        <div className="nd-segmeter-foot">
          {slotted(foot) && <span className="nd-segmeter-footnote">{foot}</span>}
          {shownValue != null && valueAt === 'foot' && <span className="nd-segmeter-value">{shownValue}</span>}
        </div>
      )}
    </div>
  )
})
