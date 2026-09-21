/*
  Switch — a setting that takes effect the moment you press it.

  IT IS A NATIVE `<input type="checkbox">` WEARING `role="switch"`, which is the whole of the
  platform advice here. There is no `<input type="switch">`; Safari 17.4 added a `switch`
  ATTRIBUTE on the checkbox and no other engine has followed, so the interoperable control is
  the checkbox — Space toggles it, Enter correctly does not, the state is real, the form
  serialises it — with the role changing only what a screen reader SAYS: "on" and "off"
  rather than "checked" and "not checked". The kit's native-first rule with the smallest
  possible override on top.

  SWITCH OR CHECKBOX IS NOT A LOOK, IT IS A PROMISE ABOUT WHEN. A switch APPLIES ON PRESS —
  it is the control for a setting that is already live, and it must never sit above a Save
  button, because a switch you have to confirm has lied about what pressing it did. A
  checkbox STATES A VALUE that something else will submit later. Both are "on or off"; they
  differ in when the world changes. If a form gathers it, it is a `Checkbox`.

  SO THE LABEL NAMES THE THING, NOT THE STATE. "Auto-save", not "Auto-save is on" and not
  "Enable auto-save" — the switch itself is already saying which way it is set, and a caption
  that also says it goes stale the instant the thumb moves. The state belongs to the control;
  the caption belongs to the subject.

  THE DRAWING IS `SwitchMark`, its own component. Same split as `CheckboxMark` and
  `RadioMark`, same reason: a row that already owns the state renders the drawing alone.

  WHAT IT DOES NOT CARRY, and each of these is a claim rather than an omission:

  · `indeterminate` — a checkbox has three states because a GROUP of them can be partly on.
    A switch is one thing, and its thumb has two positions.
  · `invalid` — the other controls take it because a form can be submitted wrong. A switch
    has no later; whatever it means was already applied, so there is no moment at which it
    can be found to be a mistake. A setting that cannot be turned on RIGHT NOW is `disabled`
    with the reason in text beside it.
  · `readOnly` — the platform ignores it on a checkbox, exactly as it does for the other two.
*/
import type { CSSProperties } from 'react'
import { useId } from 'react'

import { SwitchMark } from './SwitchMark'
/* the row ladder's rungs — a switch sits in a settings row with tags and buttons, never
   in a column with 52px fields. See Checkbox for why this is `ButtonSize`. */
import type { ButtonSize } from './Button'

export type SwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** the visible caption AND the accessible name — a real `<label>`, so the two cannot
      drift. It names WHAT the switch controls; the thumb says which way it is set. */
  label: string
  /*
    THE ROW OWNS THIS CONTROL — its caption AND its `<label>` element both.

    Two things go together and so they are one prop. A toggle inside `ListControlItem` has
    its name on the row already, so the caption goes; and the ROW is the `<label>`, so this
    must not be one too — a label inside a label is invalid HTML, and the browser's
    click-forwarding gets to choose which one it obeys.

    Rendering a `<span>` instead is what lets the row be the label: the input sits inside
    the row's own `<label>`, so a press ANYWHERE on the row activates it, natively, with no
    handler in between. The caption is gone and `label` becomes the accessible name alone. ONLY for
    a control whose ROW already names it — `ListControlItem`, whose title sits to the left
    of the toggle it hosts. Without this the row says "Auto-save" and the control says
    "Auto-save": the same name twice, two inches apart.

    `label` is still required and still becomes the accessible name; WCAG 2.5.3 holds only
    because the visible text naming this control — the row's — is the SAME string.
  */
  labelHidden?: boolean
  disabled?: boolean
  /*
    SETTLED, NOT UNAVAILABLE — and this is a REVERSAL, so the reason had better be good.

    This component used to refuse `readOnly` outright, and the refusal was written down:
    "the platform ignores `readonly` on a checkbox — it is specified as having no effect —
    so the honest options are `disabled` or a fake". That is still true of the ATTRIBUTE.
    It is not true of the STATE, and the two were being treated as one thing.

    ARIA defines `aria-readonly` for `role="checkbox"` and `role="switch"`, so the state is
    real, announced, and standard. What the platform does not give is the ENFORCEMENT, and
    the honest way to supply it is to refuse the press rather than to fake a disabled
    control: `preventDefault` on the click cancels the toggle the browser was about to
    perform — including the one Space fires — while the control keeps its focus, its
    announcement, its value and its full contrast.

    That is exactly what read-only means and what `disabled` does not: a disabled control is
    INACTIVE and exempt from the contrast floor; this one is ACTIVE and settled. The value
    is real, and the place to change it is somewhere else.
  */
  readOnly?: boolean
  size?: ButtonSize
  /** experiment: glass in the BUBBLE — the dot/thumb becomes `--container-4` showing
      through the accent. The control's own edge stays opaque, so 1.4.11 is unaffected. */
  glass?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export function Switch({
  checked,
  onChange,
  label,
  labelHidden = false,
  readOnly = false,
  disabled = false,
  size = 'small',
  glass = false,
  style,
}: SwitchProps) {
  const id = useId()
  /* the row that owns this control is the `<label>`; a label inside a label is invalid
     HTML and the browser picks which one to obey. See `labelHidden`. */
  const Shell = labelHidden ? 'span' : 'label'

  return (
    <Shell
      className={['nd-check', 'nd-switch', `s-${size}`, disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', labelHidden ? 'is-bare' : '']
        .filter(Boolean)
        .join(' ')}
      htmlFor={labelHidden ? undefined : id}
      style={style}
    >
      <span className="nd-check-control">
        {/* real, transparent, and on top — it carries the role, the state, the keyboard and
            the focus. Only the paint lives in `SwitchMark`. */}
        <input
          id={id}
          className="nd-check-input"
          type="checkbox"
          /* the one override: the element is a checkbox, the announcement is a switch */
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-readonly={readOnly && !disabled ? true : undefined}
          /* the platform gives the STATE a name and no enforcement — cancelling the click
             refuses the toggle the browser was about to do, Space included, without taking
             the focus or the announcement away. See `readOnly`. */
          onClick={readOnly ? (e) => e.preventDefault() : undefined}
          // a press inside a control must never start a node drag
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={labelHidden ? label : undefined}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <SwitchMark size={size} readOnly={readOnly} checked={checked} disabled={disabled} glass={glass} />
      </span>
      {!labelHidden && <span className="nd-check-label">{label}</span>}
    </Shell>
  )
}
