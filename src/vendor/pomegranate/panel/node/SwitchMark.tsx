/*
  SwitchMark — the track and the thumb, with nothing to press.

  THE THIRD INSTANCE OF THE SPLIT `CheckboxMark` OPENED, and by now it is the kit's shape
  rather than one component's arrangement: the DRAWING is a component, the SEMANTICS are a
  component, and a card or a list row that already owns the state renders the drawing alone.

  IT IS THE ONE MARK WHOSE STATE HAS A POSITION. A checkbox and a radio show their state by
  what appears INSIDE a box that never moves; a switch shows it by WHERE THE THUMB IS. That
  is the whole reason the control exists as a separate drawing — the thumb is present in both
  states and travels between them, so the change is legible as a movement rather than as an
  appearance. It is also why this one is worth animating and the other two are not: the
  motion IS the information, where a tick that slid in would just be a tick arriving late.

  AND THE POSITION IS THE NON-COLOUR CUE. WCAG 1.4.1 asks that colour is never the only
  carrier, and on a monochrome palette a track that merely darkened would fail it outright.
  The thumb's side of the track says on or off with the screen in greyscale, at 200% zoom,
  and in forced colours.

  THERE IS NO INDETERMINATE, and the reason is stronger than the radio's. A radio group can
  at least be UNANSWERED; a switch is a thing that is on or a thing that is off, and there is
  no third position for the thumb to occupy. A tri-state switch is a picture of a control
  that has no meaning.

  STATE COMES FROM PROPS, HOVER FROM THE CONTAINER — see `CheckboxMark`. Whatever owns the
  press drives the rest by descent.
*/

import type { ButtonSize } from './Button'

export type SwitchMarkProps = {
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

export function SwitchMark({ checked = false, disabled = false, readOnly = false, glass = false, size = 'small' }: SwitchMarkProps) {
  return (
    <span
      className={['nd-switchmark', `s-${size}`, checked ? 'is-checked' : '', disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', glass ? 'is-glass' : '']
        .filter(Boolean)
        .join(' ')}
      /* the accent pole — a checked mark IS an accent surface, and its tick is the on-accent
         ink the foundation contrast-matches to it. Saying so once here lets the fill, the
         border and both state steps be spelled --background like every other surface. */
      data-tense={checked ? 'strong' : undefined}
      aria-hidden
    >
      {/*
        THE THUMB IS ALWAYS THERE and CSS moves it, so a toggle animates one property rather
        than swapping two drawings. It carries no glyph: the foundation names `confirm` and
        the checkbox spends it, but a switch that ticks is a checkbox wearing a track — the
        position already said it.
      */}
      <span className="nd-switchmark-thumb" />
    </span>
  )
}
