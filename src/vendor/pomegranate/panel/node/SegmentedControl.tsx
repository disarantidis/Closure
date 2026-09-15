/*
  SegmentedControl — one choice from a small set, every option visible.

  IT IS A NATIVE RADIO GROUP DRAWN AS SEGMENTS, and that sentence carries the whole design.
  The peer spec (Astryx) names the semantics outright — its `label` prop documents itself as
  "accessible label for the RADIO GROUP" — and the kit already owns this argument in
  `Radio`'s header: two inputs sharing a `name` buy exactly-one-selected enforced, arrow
  keys that move the selection and wrap, and ONE TAB STOP landing on the selected member.
  Every one of those is a paragraph of APG that a row of `<button aria-pressed>` has to
  reimplement, and the two hand-rolled versions this replaces (`vs-chip`, `modechip`)
  reimplemented none of them: a Tab per chip, no arrows, nothing enforced.

  UNLIKE `Radio`, THE GROUP LIVES HERE. A radio is a MEMBER, so the radiogroup wrapper
  belongs to its caller; a segmented control IS the set, so it owns the wrapper, its role
  and its name. `label` is therefore required and never rendered — it is what a screen
  reader calls the group, exactly as DropDownSelect requires a name for the control.

  WHAT IT IS NOT, and the neighbours that already exist:

    navigation between views      → tabs (none in this kit yet; do not fake one here)
    an independent on/off         → Checkbox or Switch — this always has exactly one on
    more than ~5 options          → DropDownSelect. Even the board app's hand-rolled version
                                    had made this exact call, falling back to a native
                                    select past 4 — the boundary is real, so it is written
                                    down rather than rediscovered per call site.

  THE VALUE IS A VALUE — `onChange(value)`, like Radio and DropDownSelect: there is no
  boolean to report, because "none" is not reachable once a choice exists.

  ON BUTTON'S LADDER — 32 / 50 / 56 with `body-s` / `body-m` / `body-l`, because a segmented
  control sits in a row with buttons and tags. Its heights and horizontal padding both follow
  Button's own rungs, so a segment beside a button reads at the same density.

  WHAT IT DOES NOT CARRY: `readOnly` — no consumer, and the dials it replaces are always
  editable; the named-consumer rule says it ships with the flow that needs it.

  `block` DOES SHIP NOW, and it shipped the day it got a consumer. It was listed here as a
  deliberate omission — the peer has a `fill` layout, nobody in this kit asked for one — and
  DateTimeField's flyout asked: its month/year switch sits at the top of a popup whose width
  is the field's, and a hugging control there reads as a stray chip rather than as the thing
  that governs everything under it. The alternative was worse in a way this kit names
  elsewhere: the flyout reaching into `.nd-seg-item` to stretch the segments itself, which is
  a caller restyling another component's internals — the exact move `Button` closes
  `className` to prevent.

  A NOTE ON THAT CONSUMER, because it sits close to the line drawn above. DateTimeField's
  `Month | Year` is a GRANULARITY DIAL, not a tab set: it chooses which part of a date you
  are about to pick, and what sits under it is that choice's input surface rather than a peer
  content panel. "Month, radio button, 1 of 2" is an accurate announcement of that. The rule
  above still stands for what it was written about — a row of chips switching between
  independent VIEWS is still tabs, and still must not be faked here.
*/
import type { CSSProperties, ReactNode } from 'react'
import { useId } from 'react'

/* Button's ladder (32/50/56) — a segment is a button-sized target, so the control SIZES like a
   row of buttons (it is not MADE of them — see the type doc below); see Checkbox for why the
   TYPE is `ButtonSize` */
import type { ButtonSize } from './Button'

/*
  NO VARIANT AXIS — because there is one material. A segmented control is Button's `container`
  container with a raised chip for the choice: `primary` would make the whole track a shout,
  and a track with no boundary (`ghost`) is not a track. `outline` was the only other material
  it ever wore, and its removal from the kit left `container` alone — so the choice collapsed to a
  single value, and a prop that can only take its own default is dead vocabulary. The material
  is spelled once, on `.nd-seg` in node.css; should Button ever grow a second material a track
  can wear, the axis comes back then, with two real values rather than one.
*/

export type SegmentOption = {
  value: string
  /** the option's NAME, always — visible text unless `labelHidden`, aria-label when it is */
  label: string
  /*
    ICON-ONLY, the checks' own idiom (`labelHidden`): the text leaves, the NAME stays.
    An icon-only segment without this would be announced as nothing — the unwritable
    control the kit exists to prevent.
  */
  labelHidden?: boolean
  /** the slots — an icon, a count, a Tag. `leading`/`trailing` is now the kit's only slot
      vocabulary; Button and Tag were renamed off `left`/`right` across 90 call sites. */
  leading?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  /** the browser tooltip — the hand-rolled chips used it for the option's long name */
  title?: string
}

export type SegmentedControlProps = {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  /** the group's accessible name — REQUIRED and never rendered. A control whose caller
      shows a caption beside it still needs a name of its own, because the caption is not
      programmatically tied to the group (DropDownSelect's argument, verbatim). */
  label: string
  /*
    IT IS NOT MADE OF `<Button>`s, and could not be: a button inside a radio's label is a
    control inside a control — the double-fire ListItem measured — and it would replace the
    platform's group keyboard with nothing. It borrows Button's `container` MATERIAL; the
    semantics stay native. Same trade Tag made.
  */
  size?: ButtonSize
  disabled?: boolean
  /*
    FILL THE INLINE AXIS, WITH THE SEGMENTS SHARING IT EQUALLY. The track stretches and every
    segment takes `1fr` of it — equally rather than by content, because a dial whose segments
    are different widths reads as a row of separate buttons rather than one control, and the
    widths would then shift whenever a label's text changed.

    It is a LAYOUT flag, not a size: the rung is still `size`, and a blocked control is the
    same height it was.
  */
  block?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  size = 'small',
  disabled = false,
  block = false,
  style,
}: SegmentedControlProps) {
  const name = useId()

  return (
    <div
      /* the group's role and name live on the wrapper the component owns — the inverse of
         Radio, where the SET is the caller's decision and so is the wrapper */
      role="radiogroup"
      aria-label={label}
      className={[
        'nd-seg',
        `s-${size}`,
        /*
          THE ROW FAMILY'S MARKER — see docs/ROW-RULES.md, and Button, which sets the same class
          from the same decision. It says: this control stands at a FIELD's box, so every box
          fact a reader compares along a row (today the corner) is the field's rather than this
          component's own. `medium` is 50 and `large` is 56 — a small field and a large field
          exactly — because this control follows Button's ladder: it stands where a row of
          buttons stands (a strip of button-sized targets under one track), without being made
          of them.
        */
        size === 'medium' || size === 'large' ? 'is-fieldbox' : '',
        block ? 'is-block' : '',
        disabled ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={[
            'nd-seg-item',
            o.value === value ? 'is-on' : '',
            disabled || o.disabled ? 'is-disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          /*
            THE CHOSEN SEGMENT IS A FILLED SURFACE, and it stands on the INVERTED pole — the same
            one a chosen chip and a primary Button stand on, because it is the same thing wearing a
            track. It was `strong`, and measured the identical defect: the strong pole derives its
            ink per rung, and once the accent ladder was centred on the family's core shade those
            rungs crossed where black starts beating white, so the chosen label flipped colour with
            the rung — black at L1 `#7B7B7B` in light then white from L2, white to L2 in dark then
            black at L3 and L4. The inverted pole's ink is authored as a pair with its ground, so it
            cannot flip, and it composes with the scheme rather than replacing it.
          */
          data-tense={o.value === value ? 'inverted' : undefined}
          title={o.title}
        >
          {/* real, invisible, on top — the keyboard, the focus and the state are the
              platform's. Only the paint is ours (the `.nd-check` construction). */}
          <input
            className="nd-seg-input"
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            disabled={disabled || o.disabled}
            // a press inside a control must never start a node drag
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={o.labelHidden ? o.label : undefined}
            onChange={() => onChange(o.value)}
          />
          <span className="nd-seg-face">
            {o.leading != null && <span className="nd-seg-slot">{o.leading}</span>}
            {!o.labelHidden && <span className="nd-seg-text">{o.label}</span>}
            {o.trailing != null && <span className="nd-seg-slot">{o.trailing}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
