/*
  CheckboxMark — the box and the tick, with nothing to press.

  WHY IT IS ITS OWN COMPONENT. A checkbox's DRAWING and a checkbox's SEMANTICS are two
  different things, and a selectable card or list row wants exactly one of them. The row is
  already `role="option"` with `aria-selected`, or a `<li>` inside a `role="listbox"`, or a
  card that is itself the target — it has said "selected" once, in the place a screen reader
  reads it. Putting a real `<input type="checkbox">` inside would say it a second time and
  in a second voice, and give the row a nested tab stop it does not want.

  So this draws the mark and nothing else: no input, no label, no focus, no keyboard. It is
  `aria-hidden` by construction, because in every place it belongs the state has already
  been announced by the thing that owns it.

  IT IS NOT A CHECKBOX AND MUST NOT BE USED AS ONE. A mark with an onClick is a control with
  no role, no name and no keyboard — the failure the whole kit is built to avoid. If what
  you want is a checkbox, `Checkbox` is one; this is what that component draws.

  THE STATE COMES FROM PROPS, NOT FROM A SIBLING SELECTOR. The painted box used to be the
  `<input>` itself, so the CSS read `:checked ~ .nd-check-mark` and the drawing only existed
  where an input did. Driving it from classes is what let it leave — and it is the same move
  TextField made when its box left the control for the wrapper: the semantics stay on the
  real element, the paint moves to something that can be reused.

  HOVER, PRESS AND FOCUS BELONG TO THE CONTAINER. This component has no interaction of its
  own, so it paints rest / checked / indeterminate / disabled and nothing else. Whatever
  owns the press — `Checkbox`'s label, a card, a row — drives the rest by descent, which
  is what lets one drawing serve a control and a decoration without knowing which it is.
*/
import { ConfirmIcon } from './Icon'
import type { ButtonSize } from './Button'

export type CheckboxMarkProps = {
  checked?: boolean
  /** neither on nor off — some of the things this stands for are checked */
  indeterminate?: boolean
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

export function CheckboxMark({ checked = false, indeterminate = false, disabled = false, readOnly = false, size = 'small' }: CheckboxMarkProps) {
  return (
    <span
      className={[
        'nd-checkmark',
        `s-${size}`,
        checked && !indeterminate ? 'is-checked' : '',
        indeterminate ? 'is-indeterminate' : '',
        disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      /* the accent pole — a checked mark IS an accent surface, and its tick is the on-accent
         ink the foundation contrast-matches to it. Saying so once here lets the fill, the
         border and both state steps be spelled --background like every other surface. */
      data-tense={checked || indeterminate ? 'strong' : undefined}
      aria-hidden
    >
      {/*
        BOTH MARKS ARE ALWAYS IN THE DOM and CSS picks which is visible, so a toggle
        recomputes nothing. The tick is the foundation's `icons.semantic.confirm`; the bar
        is CSS, because the foundation names no "partial" glyph and a two-pixel bar is
        geometry rather than artwork.
      */}
      <span className="nd-checkmark-tick">
        <ConfirmIcon />
      </span>
      <span className="nd-checkmark-part" />
    </span>
  )
}
