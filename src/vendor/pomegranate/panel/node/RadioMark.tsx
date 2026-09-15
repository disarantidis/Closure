/*
  RadioMark — the circle and the dot, with nothing to press.

  THE SAME SPLIT `CheckboxMark` MAKES, for the same reason: a selectable card or list row
  that is already `role="option"` — or `role="radio"` on the row itself — wants the DRAWING
  without a second input inside it announcing the state twice.

  IT IS A CIRCLE, AND THAT IS THE WHOLE POINT OF THE SHAPE. A checkbox says "this one,
  independently"; a radio says "one of these". The two are told apart by their corners and
  by nothing else, which is why the checkbox is `radius-extra-small` — it reached for
  `radius-small` once, 8 on a 16px box, and came out a circle. This one asks for the circle
  on purpose, and the two shapes are the reason each has to be exact.

  THE DOT IS GEOMETRY, NOT ARTWORK, so it is CSS rather than a glyph — the same line the
  checkbox's indeterminate bar draws. The foundation names `confirm` and the checkbox spends
  it; it names no "dot", and a filled circle is not a drawing anyone would author twice.

  THERE IS NO INDETERMINATE. A checkbox has three states because a group of them can be
  partly checked; a radio group always has exactly one answer or none, and "partly" is not a
  thing one radio can be. The mark that would draw it does not exist here.

  STATE COMES FROM PROPS, HOVER FROM THE CONTAINER — see `CheckboxMark`. Whatever owns the
  press drives the rest by descent, which is what lets one drawing serve a control and a
  decoration without knowing which it is.
*/

import type { ButtonSize } from './Button'

export type RadioMarkProps = {
  checked?: boolean
  disabled?: boolean
  /*
    SETTLED, NOT UNAVAILABLE — the distinction `DropDownSelect` already paid for and the
    grammar this follows exactly: a DISABLED SURFACE with FULL-CONTRAST INK. Its boundary
    takes `--stroke-disabled` so the box reads as not-editable; its fill and its symbol do
    not move, because those are the VALUE and a read-only value is a real one.

    That is the whole difference from `disabled`, which dims the value itself: a disabled
    control says "come back when something else is true", a read-only one says "this is the
    answer, and it is decided elsewhere".
  */
  readOnly?: boolean
  /*
    THE MATERIAL, IN THE BUBBLE. The dot/thumb is painted `--container-4` — the kit's
    own glass surface — showing through the accent behind it. The circle/track keeps its
    opaque fill, so the control's edge against the page is untouched and the only contrast
    that changes is one this component fully controls: 4.49:1, measured, past 1.4.11's 3:1.
  */
  glass?: boolean
  /*
    THE BOX, AND IT IS THE ONLY THING A RUNG MOVES. `ButtonSize` names the full ladder, the
    same type `Checkbox` and the fields import rather than retyping a subset (§25). Every part
    of the drawing derives from the box in CSS — thumb, tick, dot, track — so this prop sets one
    value and the rest follow.

    IT DEFAULTS TO `small`, WHICH IS THE 16 THE MARK HAS ALWAYS BEEN, so no existing caller
    moves by a pixel. The rung exists because a `SelectableCard` at `large` was asking a 16px
    glyph to sit in 18px of padding beside `body-l` text, and a control that does not grow with
    what it belongs to reads as a control from somewhere else.
  */
  size?: ButtonSize
}

export function RadioMark({ checked = false, disabled = false, readOnly = false, glass = false, size = 'small' }: RadioMarkProps) {
  return (
    <span
      className={['nd-radiomark', `s-${size}`, checked ? 'is-checked' : '', disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', glass ? 'is-glass' : '']
        .filter(Boolean)
        .join(' ')}
      /* the accent pole — a checked mark IS an accent surface, and its tick is the on-accent
         ink the foundation contrast-matches to it. Saying so once here lets the fill, the
         border and both state steps be spelled --background like every other surface. */
      data-tense={checked ? 'strong' : undefined}
      aria-hidden
    >
      <span className="nd-radiomark-dot" />
    </span>
  )
}
