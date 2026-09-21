/*
  Radio — one of several, with a caption you can press.

  IT IS A NATIVE `<input type="radio">`, and here that buys more than it does for a checkbox.
  A checkbox is one control; a radio is a MEMBER of a group, and the platform gives the whole
  group model away for free the moment two inputs share a `name`:

    · exactly one selected, enforced — no caller can put two on
    · the ARROW KEYS move the selection through the group, wrapping at both ends
    · ONE TAB STOP for the whole group, landing on the selected member
    · the group's members do not have to be siblings in the DOM

  Every one of those is a paragraph of APG that a `role="radio"` div has to implement and get
  right. `name` is required by the type for exactly that reason: a radio without one is not a
  radio, it is a circle that can only ever be turned on.

  A RADIO DOES NOT TURN OFF, which is the difference the API has to carry. Pressing a selected
  checkbox unchecks it; pressing a selected radio does nothing, because "none" stops being
  reachable once a choice is made. So `onChange` hands back the VALUE that was chosen rather
  than a boolean — there is no false to report.

  THE DRAWING IS `RadioMark`, its own component, so a card or a list row can wear the circle
  without a second input inside it. Same split as `CheckboxMark`, same reason.

  WHAT IT DOES NOT CARRY: `indeterminate`, which a radio cannot be — a group is answered or it
  is not, and no single member is "partly" chosen. And `readOnly`, which the platform ignores
  on a radio exactly as it ignores it on a checkbox.
*/
import type { CSSProperties } from 'react'
import { useId } from 'react'

import { RadioMark } from './RadioMark'
/* the row ladder's rungs — a radio sits in a row or a stack with tags and buttons, never
   in a column with 52px fields. See Checkbox for why this is `ButtonSize`. */
import type { ButtonSize } from './Button'

type RadioBase = {
  /*
    THE GROUP, AND IT IS REQUIRED. Two radios share a `name` and the platform makes them one
    control: one selection, one tab stop, arrow keys between them. Without it each is an
    island that can be switched on and never off — the single most common way this element is
    got wrong, and the type refuses it.
  */
  name: string
  /** what this member stands for. Handed back by `onChange` when it is chosen. */
  value: string
  checked: boolean
  /** the VALUE, not a boolean — a radio has no false to report */
  onChange: (value: string) => void
  /** the visible caption AND the accessible name — a real `<label>`, so the two cannot drift */
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
    SETTLED, NOT UNAVAILABLE — and the ONE of the three toggles where the aria differs.

    ARIA defines `aria-readonly` for `checkbox` and `switch`. It does NOT define it for
    `radio`: a radio is a member, and read-only is a property of the SET — so the attribute
    belongs on the `radiogroup`, which is the caller's element, exactly as the group's role,
    name and arrow keys already are. Putting it on the input here would be inventing support
    the spec does not give, and an invented attribute is worse than an absent one because it
    reads as done.

    What this prop DOES do is refuse the press — `preventDefault` cancels the toggle the
    browser was about to perform — and paint the settled boundary. The row keeps its focus,
    its value and its full contrast; only the change is gone.

    SO A READ-ONLY GROUP IS TWO HALVES: `readOnly` on each member, and `aria-readonly` on the
    radiogroup you wrote. The component cannot do the second half, and says so rather than
    pretending the first half was enough.
  */
  readOnly?: boolean
  size?: ButtonSize
  /** experiment: glass in the BUBBLE — the dot/thumb becomes `--container-4` showing
      through the accent. The control's own edge stays opaque, so 1.4.11 is unaffected. */
  glass?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/* the same union the rest of the kit enforces: `invalid` says THAT something is wrong, WCAG
   3.3.1 asks for the reason in text, and the type will not let one ship alone */
type RadioValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type RadioProps = RadioBase & RadioValidity

export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  labelHidden = false,
  readOnly = false,
  disabled = false,
  invalid = false,
  describedBy,
  size = 'small',
  glass = false,
  style,
}: RadioProps) {
  const id = useId()
  /* the row that owns this control is the `<label>`; a label inside a label is invalid
     HTML and the browser picks which one to obey. See `labelHidden`. */
  const Shell = labelHidden ? 'span' : 'label'

  return (
    <Shell
      /*
        see `labelHidden`: a row that owns this control is the label, and this must not
        be a second one — the element itself is the prop
      */
      data-scheme={invalid ? 'error' : undefined}
      className={['nd-check', 'nd-radio', `s-${size}`, disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', labelHidden ? 'is-bare' : '', invalid ? 'is-invalid' : '']
        .filter(Boolean)
        .join(' ')}
      htmlFor={labelHidden ? undefined : id}
      style={style}
    >
      <span className="nd-check-control">
        {/* real, transparent, and on top — it carries the role, the group, the keyboard and
            the focus. Only the paint lives in `RadioMark`. */}
        <input
          id={id}
          className="nd-check-input"
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          /* no `aria-readonly` — the spec puts it on the radiogroup, which is yours. The
             press is refused here; the announcement is yours to make. See `readOnly`. */
          onClick={readOnly ? (e) => e.preventDefault() : undefined}
          aria-label={labelHidden ? label : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // a press inside a control must never start a node drag
          onPointerDown={(e) => e.stopPropagation()}
          onChange={() => !disabled && onChange(value)}
        />
        <RadioMark size={size} readOnly={readOnly} checked={checked} disabled={disabled} glass={glass} />
      </span>
      {!labelHidden && <span className="nd-check-label">{label}</span>}
    </Shell>
  )
}
