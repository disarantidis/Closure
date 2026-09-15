/*
  Checkbox — one thing, on or off, with a caption you can press.

  IT IS A NATIVE `<input type="checkbox">`, styled in place. The kit's rule about this is
  already written down twice: DropDownSelect keeps a native `<select>` and Combobox is
  custom ONLY because the platform has no combobox. The platform has a checkbox, and it
  arrives with Space to toggle (and, correctly, with Enter NOT toggling), the right role,
  the right announcement and the indeterminate state — all of which a `role="checkbox"` div
  would have to reimplement and none of which it would do better.

  What the platform does NOT give is the drawing, and the drawing is `CheckboxMark` — its
  own component, because a selectable CARD or LIST ROW wants the mark without the input.
  Such a row is already `role="option"` with `aria-selected`; a real checkbox inside it would
  announce the state twice and add a tab stop nobody asked for. So the box, the tick and the
  bar live there and this composes them with a real input on top.

  The tick is the foundation's `icons.semantic.confirm`. That glyph had been sitting unused
  in the inventory — Checkbox was the first thing in this kit with a checked state to draw —
  so it was added to the icon catalogue rather than hand-drawn, which is icon-test's rule.

  AND `appearance: none` TAKES ONE THING WITH IT that this header used to claim as a
  benefit: FORCED-COLOURS SUPPORT. The OS drawing is exactly what Windows High Contrast
  Mode knows how to render, and removing it means checked and unchecked can collapse to the
  same system colour — the entire state of the control, gone. node.css restates both states
  in system colours under `forced-colors: active` rather than opting out of the mode. The
  claim was wrong for as long as it took to test it, which is the argument for testing it.

  THE WHOLE ROW IS THE TARGET, not the 16px box. The component is a `<label>`, so the
  caption toggles it too, which is the platform's own behaviour and the reason the caption
  is not a separate `<span>` beside an input. That makes the target the row — at least
  `spacing-group-target-minimum` tall and as wide as the text — comfortably past WCAG
  2.5.8's floor, where a bare 16px box would have failed it.

  THE BOX DOES NOT SCALE, and that is the same rule the kit settled on every trailing
  control: a control that only has to be hittable has no reason to grow with the type beside
  it. `size` moves the ROW — 24 / 32 / 56, the row ladder — and the CAPTION, which reads
  at `microcopy` then `body-s`, exactly as Button's label and Tag's text do. The box stays
  at `component-4` in all three.

  Button's own text stops climbing at `medium`; `large` grows the line box and the padding
  rather than the letters. The caption follows that, because it is the same row.

  WHAT IT DOES NOT CARRY: `readOnly`. The platform ignores `readonly` on a checkbox — it is
  specified as having no effect — so the honest options are `disabled` or a fake, and
  DropDownSelect's fake (a one-option list) has no equivalent here. A checkbox you may look
  at but not change is `disabled`, or it is a `Tag`.
*/
import type { CSSProperties } from 'react'
import { useEffect, useId, useRef } from 'react'

import { CheckboxMark } from './CheckboxMark'
/*
  THE INLINE LADDER'S RUNGS, not the field ladder's — a checkbox sits in a row with tags and
  buttons, never in a column with 52px fields.

  It takes `ButtonSize` because that is the type naming the FULL ladder — 24, 32, 56 — the
  same reason the three fields all import `TextFieldSize` from the component that first
  declared it. Tag carries the same three rungs but its own alias.
*/
import type { ButtonSize } from './Button'

type CheckboxBase = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** the visible caption AND the accessible name — it is a real `<label>`, so the two
      cannot drift apart the way a styled `<span>` beside an input lets them. */
  label: string
  /*
    THE ROW OWNS THIS CONTROL — its caption AND its `<label>` element both.

    Two things go together and so they are one prop. A toggle inside `ListControlItem` has
    its name on the row already, so the caption goes; and the ROW is the `<label>`, so this
    must not be one too — a label inside a label is invalid HTML, and the browser's
    click-forwarding gets to choose which one it obeys.

    Rendering a `<span>` instead is what lets the row be the label: the input sits inside
    the row's own `<label>`, so a press ANYWHERE on the row activates it, natively, with no
    handler in between. The caption is gone and `label` becomes the accessible name alone.

    ONLY for a checkbox whose row already names it — `ListControlItem`, whose label sits
    to the left of the control it hosts. Without this the row says "Search tokens" and the
    checkbox says "Search tokens": the same name twice, two inches apart, which is what
    the first selection story rendered before this prop existed.

    IT IS NOT A LICENCE TO SHIP AN UNNAMED CHECKBOX. `label` is still required and still
    becomes the accessible name, and WCAG 2.5.3 (Label in Name) is satisfied only because
    the VISIBLE text naming this control — the row's — is the same string. Pass it a
    different one and you have built the failure this kit spent the whole of DropDownSelect
    arguing against.
  */
  labelHidden?: boolean
  /*
    NEITHER ON NOR OFF — the third state the platform models and the one a group needs:
    some of my children are checked. It is a DOM PROPERTY rather than an attribute, which
    is why it is set through a ref below and cannot simply be rendered.

    It is included where `DateTimeField`'s `onCommit` was not, and the line between them is
    that this is not plumbing to a flow — it is a value the control itself can be. Leaving
    it out would mean the first "select all" that needs it reaches past the component for
    the DOM node, which is worse than the prop.
  */
  indeterminate?: boolean
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
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/* the same union the rest of the kit enforces: `invalid` says THAT something is wrong,
   WCAG 3.3.1 asks for the reason in text, and the type will not let one ship alone */
type CheckboxValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type CheckboxProps = CheckboxBase & CheckboxValidity

export function Checkbox({
  checked,
  onChange,
  label,
  labelHidden = false,
  indeterminate = false,
  readOnly = false,
  disabled = false,
  invalid = false,
  describedBy,
  size = 'small',
  style,
}: CheckboxProps) {
  const id = useId()
  /* the row that owns this control is the `<label>`; a label inside a label is invalid
     HTML and the browser picks which one to obey. See `labelHidden`. */
  const Shell = labelHidden ? 'span' : 'label'
  const box = useRef<HTMLInputElement>(null)

  /* the one thing that cannot be expressed in JSX: `indeterminate` is a property of the
     element, never an attribute, so React has no way to render it */
  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <Shell
      /*
        see `labelHidden`: a row that owns this control is the label, and this must not
        be a second one — the element itself is the prop
      */
      data-scheme={invalid ? 'error' : undefined}
      className={[
        'nd-check',
        `s-${size}`,
        disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', labelHidden ? 'is-bare' : '',
        invalid ? 'is-invalid' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      htmlFor={labelHidden ? undefined : id}
      style={style}
    >
      <span className="nd-check-control">
        {/*
          THE INPUT IS REAL AND IT IS ON TOP — transparent, filling the mark, and carrying
          every bit of the semantics: the role, the state, the keyboard, the focus. What
          moved out is only the PAINT.

          It used to be the painted box itself, which is why the drawing could not leave the
          component: the CSS read `:checked ~ .nd-check-mark`, so the mark only existed where
          an input did. This is the same move TextField made when its box left the control
          for the wrapper — the semantics stay on the real element and the paint goes
          somewhere it can be reused.
        */}
        <input
          ref={box}
          id={id}
          className="nd-check-input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-readonly={readOnly && !disabled ? true : undefined}
          /* the platform gives the STATE a name and no enforcement — cancelling the click
             refuses the toggle the browser was about to do, Space included, without taking
             the focus or the announcement away. See `readOnly`. */
          onClick={readOnly ? (e) => e.preventDefault() : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // a press inside a control must never start a node drag
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          /* the name survives the caption leaving — see `labelHidden` */
          aria-label={labelHidden ? label : undefined}
        />
        <CheckboxMark size={size} readOnly={readOnly} checked={checked} indeterminate={indeterminate} disabled={disabled} />
      </span>
      {!labelHidden && <span className="nd-check-label">{label}</span>}
    </Shell>
  )
}
