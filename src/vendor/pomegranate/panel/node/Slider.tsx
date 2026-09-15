/*
  Slider — a quantity in a range that the USER sets.

  THE FAMILY IS NOW THREE, AND THE ELEMENT IS THE WHOLE DISTINCTION:

    <progress>  a quantity that is BECOMING — it will finish, and nobody can move it
    <meter>     a quantity that IS — it has thresholds, and nobody can move it
    <input      a quantity that IS — and it is YOURS TO MOVE
     type=range>

  So the test for which one to reach for is not what it looks like: all three are an edge with a
  fraction filled. It is who owns the number. If the answer is "the system, and it will finish",
  that is ProgressBar. If it is "the system, and it just is", that is Meter. If it is "the person
  looking at it", it is this.

  MEASURED IN THE BROWSER BEFORE ANY OF THIS WAS WRITTEN — `<input type="range">` arrives with:

    · role=slider, implicitly. No role, no aria-valuenow, no aria-valuemin/max written by hand.
    · the entire keyboard. Home went to 0 and End to 100 with nothing bound: arrows, Page keys
      and the two extremes are all the UA's.
    · min / max / step, clamping and snapping included.
    · valueAsNumber, so the value never has to be parsed back out of a string.
    · labelability — it is on the same list as input, select and textarea, so a real <label for>
      IS the accessible name rather than a second copy of it beside an aria-label.

  AND TWO THINGS IT DOES NOT GIVE, both found by measuring rather than by reading:

  1. NO FILLED PORTION. WebKit paints a track and a thumb and nothing between the start and the
     thumb, so the fill is ours — a gradient driven by `--nd-slider-pct`, exactly as ProgressBar's
     ring drives its dash from a percentage. Firefox has ::-moz-range-progress and this engine
     reports it unsupported, so the gradient is the one drawing that works everywhere rather than
     two drawings that disagree.

  2. `readonly` IS SILENTLY IGNORED. Set `readOnly` on a range, press End, and the value moves
     anyway — measured: 50 became 100. That is the HTML spec, not a browser bug: readonly does not
     apply to type=range.

     SO THERE IS NO `readOnly` PROP HERE, and refusing it is the honest move rather than faking it
     with pointer-events and a tabindex. A slider whose value cannot be changed is not a slider
     with a flag set — it is a Meter. The type says so, and the docs point at Meter by name.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import type { ProgressOrientation, ProgressSize, ProgressValueAt } from './ProgressBar'
import { isFloor, recessLevel, useLevel } from './LevelContext'

/*
  THE THREE RUNGS AND THE TWO AXES ARE ProgressBar's, ALIASED RATHER THAN RETYPED — §25's rule, and
  the same one Meter follows. Badge and SegmentedControl wrote their subsets as fresh literal
  unions and a fourth rung would not have reached them.
*/
export type SliderSize = ProgressSize
export type SliderOrientation = ProgressOrientation
export type SliderValueAt = ProgressValueAt

export type SliderProps = {
  /** the name. A real <label for> when visible, an aria-label when not — never both */
  label: string
  labelHidden?: boolean
  /** controlled, like every other field in the kit */
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /**
    the granularity. Left undefined the platform's default of 1 applies; `any` is the platform's
    own escape hatch for a continuous slider and is passed straight through.
  */
  step?: number | 'any'
  size?: SliderSize
  orientation?: SliderOrientation
  /** where the formatted number sits — head, on the line, or in the foot */
  valueAt?: SliderValueAt
  showValue?: boolean
  formatValue?: (value: number, max: number) => string
  disabled?: boolean
  /*
    TICKS ARE HALF THE PLATFORM'S AND HALF OURS, and the split was measured rather than assumed.

    THE ASSOCIATION IS THE PLATFORM'S: a `<datalist>` referenced by `list` is the element's own way
    of saying this range has stops, so that is what is rendered and it costs nothing to keep.

    THE MARKS ARE NOT. Chrome draws tick marks for a `list` only while the track wears its default
    appearance — and this one cannot, because `appearance: none` is what lets the rail take the
    foundation's own thickness and fill. Measured: with the datalist rendering, no marks appear.
    So the marks are drawn here, from the same numbers, and the comment says so instead of claiming
    a platform feature that is switched off two rules away.
  */
  ticks?: number[]
  /** the four slots the family shares: two flanking the track, one above, one below */
  leading?: ReactNode
  trailing?: ReactNode
  head?: ReactNode
  foot?: ReactNode
  style?: CSSProperties
}

const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    labelHidden = false,
    value,
    onChange,
    min = 0,
    max = 100,
    step,
    size = 'medium',
    orientation = 'horizontal',
    valueAt = 'head',
    showValue = false,
    formatValue,
    disabled = false,
    ticks,
    leading,
    trailing,
    head,
    foot,
    style,
  },
  ref
) {
  const id = useId()
  const listId = `${id}-ticks`
  const clamped = Math.min(max, Math.max(min, value))
  const shownValue = showValue ? (formatValue ? formatValue(clamped, max) : `${Math.round(clamped)}%`) : null

  /*
    A UNITLESS FRACTION, NOT A PERCENTAGE — and the difference is a real defect this shipped with.

    It is a fraction of the RANGE rather than of the max: a slider from 20 to 40 sitting at 30 is
    half full, not three-quarters. ProgressBar starts at zero by definition so it never had to make
    that distinction; a slider does.

    IT IS UNITLESS BECAUSE THE CSS HAS TO INSET IT. A percentage of the rail is NOT where the thumb
    is: the thumb's CENTRE travels from half a thumb in to half a thumb from the end, so a fill
    drawn at a raw 62% of the rail ran 2.9px past the thumb — and 12px past it at either extreme,
    which is the whole thumb. The ticks already carried that inset; the fill did not, and the two
    disagreed with each other on the same rail. Now both multiply the same fraction by the same
    travel, in one place.
  */
  const fraction = max === min ? 0 : (clamped - min) / (max - min)

  return (
    <div
      /*
        THE TRACK IS A GROOVE — one rung DOWN from the ground it is cut into, except at the
        floor, where `data-floor` hands the stylesheet its own nudge toward black. This is
        Meter's and ProgressBar's recipe verbatim; those two carried it and these did not, so
        `--nd-groove` — declared only under `[data-fill]` — resolved to nothing here and the
        unfilled track painted NOTHING at all. The filled part spends the accent and was
        unaffected, which is exactly why it read as a design choice rather than a defect.
      */
      data-fill={isFloor(useLevel()) ? undefined : recessLevel(useLevel())}
      data-floor={isFloor(useLevel()) || undefined}
      className={['nd-slider', `s-${size}`, `o-${orientation}`, disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      style={{ ['--nd-slider-fraction' as string]: fraction, ...style }}
    >
      {(!labelHidden || (shownValue != null && valueAt === 'head') || slotted(head)) && (
        <div className="nd-progress-head">
          {!labelHidden && (
            <label className="nd-progress-label" htmlFor={id}>
              {label}
            </label>
          )}
          {slotted(head) && <span className="nd-progress-slot nd-progress-slot-head">{head}</span>}
          {shownValue != null && valueAt === 'head' && <span className="nd-progress-value">{shownValue}</span>}
        </div>
      )}
      <div className="nd-progress-line">
        {slotted(leading) && <span className="nd-progress-slot">{leading}</span>}
        {/*
          THE ELEMENT CARRIES THE SEMANTICS — no role, no aria-valuenow, no aria-valuemin or max.
          Writing them by hand would be a second, drifting copy of what the element already says,
          which is the same reason ProgressBar and Meter write none either.
        */}
        <input
          ref={ref}
          className="nd-slider-track"
          id={id}
          type="range"
          {...(labelHidden ? { 'aria-label': label } : {})}
          min={min}
          max={max}
          {...(step != null ? { step } : {})}
          {...(ticks?.length ? { list: listId } : {})}
          value={clamped}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
        />
        {ticks?.length ? (
          <>
            <datalist id={listId}>
              {ticks.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {/*
              THE MARKS ARE A PICTURE OF THE DATALIST, so they are `aria-hidden`: the element and its
              list already say where the stops are, and a second row of nodes in the tree would be
              the same fact twice — the rule `CheckboxMark` was split out to enforce.
            */}
            <span className="nd-slider-ticks" aria-hidden>
              {ticks.map((t) => (
                <i
                  key={t}
                  className="nd-slider-tick"
                  /*
                    A UNITLESS FRACTION, NOT A PERCENTAGE — the CSS multiplies it by the thumb's real
                    travel, and `calc()` will not multiply one percentage by another.
                  */
                  style={{ ['--nd-tick-fraction' as string]: max === min ? 0 : (t - min) / (max - min) }}
                />
              ))}
            </span>
          </>
        ) : null}
        {slotted(trailing) && <span className="nd-progress-slot">{trailing}</span>}
        {shownValue != null && valueAt === 'inline' && <span className="nd-progress-value">{shownValue}</span>}
      </div>
      {(slotted(foot) || (shownValue != null && valueAt === 'foot')) && (
        <div className="nd-progress-foot">
          {slotted(foot) && <span className="nd-progress-footnote">{foot}</span>}
          {shownValue != null && valueAt === 'foot' && <span className="nd-progress-value">{shownValue}</span>}
        </div>
      )}
    </div>
  )
})
