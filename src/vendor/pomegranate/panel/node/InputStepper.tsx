/*
  InputStepper — a value with a floor and a ceiling, stepped from either end.

  RESEARCHED IN A PROBE FIRST (`InputStepperProbe.stories.tsx`, now deleted), against MDN's
  spinbutton role, GOV.UK's case against `type="number"`, and Adobe Spectrum's/Fluent's own
  InputStepper. Three questions were live; this component is what answered them.

  MECHANISM: native `type="number"`. GOV.UK's objection is about digit-strings — passport and
  phone numbers, where stepping is meaningless — which is not this component; every consumer
  here is a real, steppable quantity. Its one real cost, the mouse wheel silently changing the
  value, is a genuine risk on an infinite pan/zoom canvas: `onWheel` blurs the field, so a wheel
  that lands on it hands the gesture back to whatever the canvas does with scroll, rather than
  quietly incrementing a number nobody meant to touch.

  GLYPH: geometry, not the catalogue's `caret`. The foundation names 21 icons and none of them
  is a plus or a minus — the same wall `CheckboxMark`'s indeterminate bar hit, answered the same
  way: two CSS bars are geometry, not artwork nobody has drawn before.

  SIZE: the INLINE ladder — `small` / `medium` / `large`, `Button`'s own rungs — not the field
  ladder `TextField` shares with `Combobox`/`DropDownSelect`. A number field is a compound (two
  buttons around a value), so the choice was genuinely open; every real consumer today sits
  inline in a card row beside a `SegmentedControl`, never alone in a form, which is what a
  counter is and a field is not.

  THE ENDS ARE `Button`, IN SLOT-ONLY MODE — measured against a hand-rolled end, which came out
  two pixels short of a square at every rung (24×22, 34×30, 44×38) because it sat inside the
  field's border instead of owning its own box. `Button`'s own arithmetic is the fix, not a
  border tweak. `Button` refuses `className`, so the flanking layout hangs off `data-end`
  instead, and `title` is pushed back to `undefined` on the hidden ends — `Button` writes
  `title={label}` on every instance, which on an `aria-hidden` control would raise a native
  tooltip for something screen readers are told to ignore.

  NEITHER END IS A KEYBOARD STOP. MDN's spinbutton rule: the increment controls duplicate ↑/↓,
  so a pointer affordance that repeats a keyboard one needs no second tab stop — both carry
  `tabIndex={-1}` and `aria-hidden`. THE FLOOR IS THE ONE EXCEPTION, and only when `onRemove` is
  given: removing is not what ArrowDown does (arrows clamp, they must never destroy), so there
  is no keyboard path to it at all — it stops being a picture of a key and becomes the only way
  to reach a destructive command, so at the floor it takes focus, takes a real name, and stops
  being hidden. Without `onRemove` the decrement simply disables at the floor, Fluent's rule.
  Nobody in this codebase has needed it yet — it ships because the shape is right, not because a
  call site is waiting on it; the day one is, the type is already there.

  VARIANTS ARE BUTTON'S, TOKEN FOR TOKEN — `container`/`primary`/`ghost`, taken rather than
  re-picked, because a field that invented its own container would be a second answer to a question
  the kit already settled. `container` is the default. THE RING DRAWS OUTSIDE THE WHOLE FIELD, `TextField`'s own pattern
  (`--focus-offset-standard`, on `:has()` rather than the input alone) rather than an inset ring
  on the input — which is also what keeps `primary` out of the accent-on-accent trap an inset
  ring would have walked into, with no per-variant override needed.

  DISABLED DIMS THE VALUE; READ-ONLY DOES NOT — the same pair `DropDownSelect` pays for and
  `TextField` paints. A read-only value is a real value, so dimming it would lie about the data
  rather than about the control; the platform draws the rest, since a `readOnly` input stays
  focusable and its text stays selectable, where a `disabled` one is neither.
*/
import type { CSSProperties } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { Button, type ButtonSize, type ButtonVariant } from './Button'

export type InputStepperProps = {
  value: number
  onChange: (next: number) => void
  /** the accessible name — there is no visible label on a counter, so this is the only one */
  label: string
  min?: number
  max?: number
  step?: number
  size?: ButtonSize
  variant?: ButtonVariant
  /** stretch to the width of whatever holds it, Button's own name for the same axis */
  block?: boolean
  disabled?: boolean
  readOnly?: boolean
  /**
   * present ONLY when reaching `min` means "this doesn't exist any more" rather than "as low as
   * it goes" — turns the floor's decrement into a real, focusable, named "Remove …" control.
   * Absent, the decrement simply disables at the floor.
   */
  onRemove?: () => void
  style?: CSSProperties
}

export function InputStepper({
  value,
  onChange,
  label,
  min = -Infinity,
  max = Infinity,
  step = 1,
  size = 'small',
  variant = 'tonal',
  block = false,
  disabled = false,
  readOnly = false,
  onRemove,
  style,
}: InputStepperProps) {
  const inert = disabled || readOnly
  const atFloor = value <= min
  /* neither state offers the bin: a value that cannot change cannot be stepped to nothing */
  const removing = atFloor && !!onRemove && !inert

  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const stepBy = (d: 1 | -1) => onChange(clamp(Math.round((value + d * step) * 1e6) / 1e6))

  return (
    <span
      data-fill={fieldLevel(useLevel())}
      /* the accent pole — see Button's note; primary is an accent surface with slots */
      /*
        PRIMARY IS THE INVERTED SURFACE — see Button.tsx for the whole argument. Short version: it
        only looked like the accent while the accent was an absolute, and centring the accent
        ladder on the core shade made its ink FLIP mid-ladder, because the strong pole derives ink
        per rung. The inverted pole's ink is authored as a pair with its ground, and it is a POLE
        rather than `data-scheme="inverted"` so a destructive one stays red.
      */
      data-tense={variant === 'primary' ? 'inverted' : undefined}
      className={[
        'nd-inputstepper',
        `v-${variant}`,
        `s-${size}`,
        /* THE ROW-FAMILY CORNER — `medium`/`large` stand at a field's box (50/56), so the corner
           steps up to the field's `--radius-medium` exactly as Button and SegmentedControl do,
           and `small` (32) keeps the `--radius-small` base. It is a fact about the box, not the
           rung, so it rides one class — see the note on `.nd-btn.is-fieldbox` and §50. */
        size === 'medium' || size === 'large' ? 'is-fieldbox' : '',
        block ? 'is-block' : '',
        disabled ? 'is-disabled' : '',
        readOnly ? 'is-readonly' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {removing ? (
        <Button size={size} variant="ghost" glass={false} kind="icon-button" label={`Remove ${label}`} onClick={onRemove} data-end="less" />
      ) : (
        <Button
          size={size}
          variant="ghost"
          glass={false}
          kind="icon-button"
          label="Decrease"
          title={undefined}
          tabIndex={-1}
          aria-hidden
          disabled={inert || atFloor}
          onClick={() => stepBy(-1)}
          data-end="less"
          leading={<span className="nd-inputstepper-geo is-minus" aria-hidden />}
        />
      )}
      <input
        className="nd-inputstepper-input"
        type="number"
        inputMode="decimal"
        value={value}
        min={min === -Infinity ? undefined : min}
        max={max === -Infinity ? undefined : max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={label}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
        onWheel={(e) => e.currentTarget.blur()}
      />
      <Button
        size={size}
        variant="ghost"
        glass={false}
        kind="icon-button"
        label="Increase"
        title={undefined}
        tabIndex={-1}
        aria-hidden
        disabled={inert || value >= max}
        onClick={() => stepBy(1)}
        data-end="more"
        leading={<span className="nd-inputstepper-geo is-plus" aria-hidden />}
      />
    </span>
  )
}
