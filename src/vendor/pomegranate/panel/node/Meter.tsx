/*
  Meter — a quantity that IS, where ProgressBar is a quantity that is BECOMING.

  THEY LOOK ALIKE AND AGREE ABOUT ALMOST NOTHING ELSE, which is why they are two components
  rather than a prop. Spectrum keeps them apart; the platform draws the line harder than any
  design system does, and the two element APIs are exact complements — measured in the browser
  before a line of this was written:

                          <progress>                    <meter>
    the unknown state     `position: -1`                `indeterminate` is not on the prototype
    the threshold axis    none                          `low` / `high` / `optimum`
    the shadow parts      ::-webkit-progress-value      ::-webkit-meter-optimum-value,
                                                        -suboptimum-value, -even-less-good-value

  A progress bar has a state for "we don't know" and no notion of a good or bad reading; a meter
  has three graded readings and no notion of not knowing, because a quantity you are MEASURING is
  always known. Neither absence is an oversight.

  IT MATTERS MOST WHERE IT IS INVISIBLE. `role="progressbar"` announces something in flight, so a
  disk gauge wearing it tells a screen-reader user to wait for something that will never finish.
  Two identically-drawn bars, and the difference only shows up for the people who cannot see
  either of them.

  THE PEER GOT THIS WRONG, AND ITS API SHOWS THE COST. Astryx ships no Meter, and two of its own
  block templates are meters wearing the progress bar: `ProgressBarCustomFormat` is disk usage in
  GB, `ChatComposerDrawerWithProgress` is context-window usage against a token budget. Because one
  component covers both jobs, its colour had to become a MANUAL prop —
  `variant: 'accent' | 'success' | 'warning' | 'error' | 'neutral'` — so the caller works out
  whether 3.2 of 5 GB is a warning and passes the answer in. `low`/`high`/`optimum` derives that
  from the numbers, which is the whole reason the attributes exist.

  SO THE TONE IS DERIVED, NEVER DECLARED — this kit's oldest rule, and the platform's algorithm
  is the derivation. There is no `variant` here and no colour anywhere in the component; the
  region the value falls in picks a scheme island, exactly as ProgressBar's ENDING does.

  ONE LAYOUT, TWO ELEMENTS. Everything around the track — the head row, the flanking slots, the
  foot, the three rungs — is shared with ProgressBar at the CSS level rather than copied, because
  a meter beside a progress bar that disagreed about its own label size would be the drift this
  kit spends most of its comments preventing.
*/
import type { CSSProperties, ReactNode } from 'react'
import { isFloor, recessLevel, useLevel } from './LevelContext'
import { forwardRef, useId } from 'react'
import type { ProgressSize, ProgressOrientation, ProgressValueAt } from './ProgressBar'

/*
  THE SAME RUNGS, TIED TO THE SOURCE RATHER THAN RETYPED. §25's lesson: Badge and SegmentedControl
  wrote their material subsets as fresh literal unions, and a fifth material would not have
  reached them. An alias cannot drift.
*/
export type MeterSize = ProgressSize

/*
  THE SAME AXIS, ALIASED — and it is here rather than left to ProgressBar because the two share
  one layout. Giving an axis to one of them alone is exactly the drift the sharing exists to
  prevent, and a vertical gauge is if anything the more natural of the two: a level, a fill, a
  quota reads upright in a way an operation's progress does not.
*/
export type MeterOrientation = ProgressOrientation

/* the same three bands, aliased for the same reason — one layout, one placement vocabulary */
export type MeterValueAt = ProgressValueAt

/*
  THE THREE REGIONS ARE THE PLATFORM'S, NOT THIS KIT'S. HTML defines them from `low`, `high` and
  `optimum`, and the arrangement is less obvious than it looks: when `optimum` sits INSIDE the
  middle band, both outer regions are merely suboptimum and there is no worst region at all —
  which is what "keep this between 40 and 80" actually means, since too little and too much are
  equally wrong. `worst` exists only when the optimum is at one end.
*/
export type MeterRegion = 'optimum' | 'suboptimum' | 'worst'

export type MeterProps = {
  /*
    REQUIRED, AND USUALLY HIDDEN — ProgressBar's rule for the same reason. A gauge with no name
    announces a number with no subject: "62%" of what.
  */
  label: string
  labelHidden?: boolean
  /*
    REQUIRED, AND THIS IS THE ONE PROP THAT DIVIDES THE TWO COMPONENTS. ProgressBar's `value` is
    optional because its absence IS the indeterminate state; a meter has no such state, so there
    is no way to write one that does not know its own reading.
  */
  value: number
  min?: number
  max?: number
  /*
    THE THRESHOLDS. Leave them out and the meter has one region and no tone — a bare gauge, which
    is the honest default for a quantity nobody has said anything about yet.
  */
  low?: number
  high?: number
  optimum?: number
  /** show the value as text beside the label — percent of the range by default */
  showValue?: boolean
  formatValue?: (value: number, max: number) => string
  size?: MeterSize
  orientation?: MeterOrientation
  /** where the formatted value sits. Ignored unless `showValue` */
  valueAt?: MeterValueAt
  /* the same four slots ProgressBar carries, and live for the same reason: a meter is not a
     target either, so a link in `foot` is reachable the way a link in a paragraph is */
  leading?: ReactNode
  trailing?: ReactNode
  head?: ReactNode
  foot?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

const percent = (v: number, m: number) => `${Math.round((v / m) * 100)}%`
const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/*
  THE REGION, FOLLOWING HTML'S OWN ALGORITHM. It has to be computed here rather than left to CSS,
  and that is a browser fact rather than a preference: Gecko exposes the regions as PSEUDO-CLASSES
  (`:-moz-meter-optimum`) which could drive a rule on the element, but WebKit exposes them only as
  PSEUDO-ELEMENTS (`::-webkit-meter-optimum-value`), which can paint the fill and can never reach
  the wrapper that carries the scheme island. One computation in TypeScript is the only form that
  is the same in both engines — and it is the same handful of comparisons the element is making
  internally either way.

  EXPORTED SO IT CAN BE TESTED as arithmetic rather than through a rendered specimen.
*/
export function meterRegion(opts: {
  value: number
  min: number
  max: number
  low?: number
  high?: number
  optimum?: number
}): MeterRegion {
  const { min, max } = opts
  const value = clamp(opts.value, min, max)
  /* the spec's own defaults and its own repair: an unspecified bound is the range's own edge,
     and a `low` above `high` is pulled down to it rather than treated as an error */
  const low = clamp(opts.low ?? min, min, max)
  const high = clamp(Math.max(opts.high ?? max, low), low, max)
  const optimum = clamp(opts.optimum ?? (min + max) / 2, min, max)

  const region = value < low ? 'low' : value > high ? 'high' : 'middle'

  if (optimum < low) {
    /* the good end is the bottom — a disk, a budget, an error rate */
    return region === 'low' ? 'optimum' : region === 'middle' ? 'suboptimum' : 'worst'
  }
  if (optimum > high) {
    /* the good end is the top — a score, a coverage, a completeness */
    return region === 'high' ? 'optimum' : region === 'middle' ? 'suboptimum' : 'worst'
  }
  /* the good part is the middle, so both ends are equally wrong and neither is the worst */
  return region === 'middle' ? 'optimum' : 'suboptimum'
}

/*
  THE REGION IS A SCHEME, WHICH IS ProgressBar's ENDING APPLIED TO A THRESHOLD. There is no green,
  no amber and no red in this component or its CSS.

  AND THE GOOD READING GETS NO ISLAND AT ALL. That is the restrained choice and it is deliberate:
  painting every healthy gauge green teaches a reader to stop seeing green, so colour appears here
  only when something wants attention — the same reason ProgressBar's `active` has no island
  either. A caller who genuinely wants "green because it finished" is describing a completed
  operation, and that is ProgressBar's `done`.
*/
const SCHEME: Record<MeterRegion, string | undefined> = {
  optimum: undefined,
  suboptimum: 'warning',
  worst: 'error',
}

export const Meter = forwardRef<HTMLDivElement, MeterProps>(function Meter(
  {
    label,
    labelHidden = false,
    value,
    min = 0,
    max = 100,
    low,
    high,
    optimum,
    showValue = false,
    formatValue = percent,
    size = 'medium',
    orientation = 'horizontal',
    valueAt = 'head',
    leading,
    trailing,
    head,
    foot,
    style,
  },
  ref
) {
  const id = useId()
  const clamped = clamp(value, min, max)
  /* built once, placed once — see ProgressBar for why this is a placement and not a slot */
  const shownValue = showValue ? formatValue(clamped, max) : null
  const region = meterRegion({ value, min, max, low, high, optimum })

  const ground = useLevel()
  return (
    <div
      ref={ref}
      /* the track is a GROOVE: one rung down from the ground it is cut into. At the floor
         there is no rung below, so `is-floor` hands the stylesheet its own fallback
         (node.css, AND THE GROOVE IS THE SAME MECHANISM POINTED DOWN) */
      data-fill={isFloor(ground) ? undefined : recessLevel(ground)}
      data-floor={isFloor(ground) || undefined}
      className={['nd-meter', `s-${size}`, `o-${orientation}`, `v-${valueAt}`, `is-${region}`].join(' ')}
      style={style}
      data-scheme={SCHEME[region]}
    >
      {(!labelHidden || (shownValue != null && valueAt === 'head') || slotted(head)) && (
        <div className="nd-meter-head">
          {/* a real `<label for>`: `<meter>` is on the same labelable list as `<progress>` */}
          {!labelHidden && (
            <label className="nd-meter-label" htmlFor={id}>
              {label}
            </label>
          )}
          {slotted(head) && <span className="nd-meter-slot nd-meter-slot-head">{head}</span>}
          {shownValue != null && valueAt === 'head' && <span className="nd-meter-value">{shownValue}</span>}
        </div>
      )}
      <div className="nd-meter-line">
        {slotted(leading) && <span className="nd-meter-slot">{leading}</span>}
        {/*
          TWO ELEMENTS, ONE JOB — because the platform's own `<meter>` cannot be drawn to the
          spec this kit paints to. Chrome refuses to stretch the shadow chain (element →
          inner-element → bar → value) to the CSS-set track height even when every step is told
          `block-size: 100%` and `appearance: none`. Tested with a magenta background painted on
          the host: the host fills, the shadow children draw at roughly half the host's height
          with a fixed intrinsic size the CSS cannot reach. The visible symptom is a fill
          sitting inside a fuller track like a pill inside a pill, worse the taller the rung.
          Two elements is the only way out: the `<meter>` stays for the platform's own graded
          semantics (`low`/`high`/`optimum` → assistive-tech region), hidden from sight, and a
          plain div pair carries the picture. The fill's percentage is computed here — one
          calculation the CSS cannot make on its own — and applied as the axis property, so the
          axis swap for vertical is one CSS declaration and not a second inline style path.
        */}
        <meter
          className="nd-sr-only"
          id={id}
          {...(labelHidden ? { 'aria-label': label } : {})}
          min={min}
          max={max}
          value={clamped}
          {...(low == null ? {} : { low })}
          {...(high == null ? {} : { high })}
          {...(optimum == null ? {} : { optimum })}
        />
        <div className="nd-meter-track" aria-hidden="true">
          <div
            className="nd-meter-fill"
            style={{ '--nd-meter-fill': `${((clamped - min) / (max - min)) * 100}%` } as CSSProperties}
          />
        </div>
        {slotted(trailing) && <span className="nd-meter-slot">{trailing}</span>}
        {shownValue != null && valueAt === 'inline' && <span className="nd-meter-value">{shownValue}</span>}
      </div>
      {(slotted(foot) || (shownValue != null && valueAt === 'foot')) && (
        <div className="nd-meter-foot">
          {slotted(foot) && <span className="nd-meter-footnote">{foot}</span>}
          {shownValue != null && valueAt === 'foot' && <span className="nd-meter-value">{shownValue}</span>}
        </div>
      )}
    </div>
  )
})
