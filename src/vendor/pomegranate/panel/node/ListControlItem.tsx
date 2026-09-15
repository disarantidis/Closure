/*
  ListControlItem — a row whose value is a CONTROL, inert by construction.

  THE STANDALONE TWIN OF `NodeControlRow`, carrying forward its two decisions because
  both were correct and both were paid for:

  · IT NEVER BECOMES A BUTTON, and its type takes no `onClick`. Invalid interactive nesting
    is not a rule to remember here; it is unwritable.

    THE WHOLE ROW IS STILL PRESSABLE, and that is the point of what it IS instead: a
    `<label>`. Press the title, the subtitle, the empty space at the end — the toggle
    flips, because that is what a label does for the control it wraps. No handler, no
    forwarding, no `onClick` on the row calling `input.click()` and then having to work out
    whether the press had already been counted once.

    A BUTTON WOULD HAVE BEEN THE WRONG ELEMENT TWICE OVER: a control cannot nest inside
    one, and a row that toggles something is not an action — it is the NAME of the thing
    it toggles. `<label>` says exactly that, to the browser and to a screen reader.

  · THE HINT HAS AN ID A CONTROL CAN POINT AT. `hint` is the line under the control —
    what the value resolves to, or what went wrong — and `hintId` is what lets the
    control say `aria-describedby={hintId}`, so "invalid entry" arrives WITH its words.
    The pairing that used to exist only in the layout exists in the accessibility tree.

  THE ROW'S LABEL IS PRESENTATIONAL, and that is settled doctrine rather than an
  oversight: "a select inside a labelled row still needs a label of its own, because the
  row's label is not programmatically tied to it." The CONTROL names itself — every kit
  field requires a `label` for exactly this reason — and the row captions the region a
  sighted reader scans. Two different jobs, two different elements.

  WHAT IT HOSTS IS A TOGGLE — a `Checkbox`, a `Radio`, a `Switch`. That is the whole of it,
  and the boundary is what makes this component's promise keepable.

  A toggle is ON or OFF, and it says so itself — the mark is drawn, the input is announced,
  the keyboard reaches it. A value-picker has a VALUE rather than a state, and a row hosting
  one is a row that STATES something: `ListItem` with `readOnly` and the picker in its
  `trailing` slot. Same anatomy, different claim, and the claim is why there are two
  components rather than one with a flag.

  WHICH IS ALSO WHY THE TOGGLE MUST NOT BE A LABEL ITSELF. `labelHidden` renders it as a
  `<span>` rather than a `<label>`: a label inside a label is invalid HTML and the browser
  chooses which one to obey. With the row as the only label, one press is one toggle
  wherever it lands — including on the control, because a label does not re-forward a click
  that started on the control it labels.

  ONE CONTROL PER ROW, THEREFORE. A `<label>` activates the FIRST form control inside it, so
  a row with a checkbox leading AND a switch trailing would toggle only the checkbox — and
  say nothing about it. Two toggles in one row is two questions in one row; give them a row
  each.

  A HOSTED TOGGLE MUST NOT BRING ITS OWN CAPTION. Each of the three is ALREADY a row: a
  `<label>` with a caption and a target the full width. Dropped in with its caption still
  on, the row says "Auto-save" and the control says "Auto-save" — the same name, twice, two
  inches apart. So the row's TITLE names the control and the control renders none of its
  own: all three take `labelHidden`, which keeps `label` as the accessible name while the
  caption goes. WCAG 2.5.3 holds because the visible text naming the control is the row's
  and the two strings are the same one.

  TONE IS A SCHEME here too: an invalid control row is the control's own
  `invalid`/`describedBy` pair plus this row's hint carrying the words. The row itself
  paints nothing the scheme does not give it.

  ── AND IT CARRIES NO SELECTION, WHICH IS WHERE THAT ARGUMENT LANDED ────────────────

  This had a `selected` prop, and following it to the end removed it. The chain is worth
  keeping because each step was right:

    1. Selection moved HERE, because selecting is what a control does and a row with no
       control has nothing to be selected by.
    2. It set no `aria-selected`, because the CONTROL announces the state — saying it twice
       is the failure `CheckboxMark` was split out to prevent. So it was paint only.
    3. The leading BAR went, because the toggle is the non-colour cue and it is guaranteed:
       this row always hosts one.
    4. The background tint went too.

  Nothing was left. A prop that paints nothing and announces nothing is the dead half this
  kit refuses, so it is gone — and the state is not lost, it never lived here: the checkbox
  is checked, the switch is on, and that is visible, announced and keyboard-operable without
  the row repeating any of it.

  WHAT A CALLER WANTS THE ROW TO DO WHEN SELECTED is now a caller's decision with a caller's
  tools — `style`, or a `data-scheme` island, or nothing. The component stopped guessing.

  THE CONTROL MAY LEAD OR TRAIL, which is why `children` is optional. A selection list puts
  its checkbox at the FRONT (`leading`) and often has nothing at the end; a settings list puts
  its switch at the END (`children`). Same row, same contract, two arrangements.
*/
import type { CSSProperties, ReactNode } from 'react'

/* the row ladder's rungs — see ListItem */
import type { ButtonSize } from './Button'

export type ListControlItemProps = {
  /** the row's caption — presentational; the control inside carries its own name */
  title: string
  /*
    THE SECOND LINE — the same annotation `ListItem` carries, and the same warning applies
    to its name: `subtitle` is also a foundation TEXT STYLE, and that style is `body-l`,
    18px. This renders `microcopy`, 12, recessive, at every rung.

    It is what a settings row says under its caption — "applies immediately", "follows the
    style group" — and it is NOT the `hint`. The hint belongs to the CONTROL and carries an
    id the control cites; this belongs to the TITLE and carries nothing.
  */
  subtitle?: ReactNode
  /*
    THE TRAILING CONTROL — rendered as-is, never wrapped in anything interactive.

    It is `trailing` and no longer `children`, because `leading`/`trailing` is one pair and
    a component that spelled one half of it differently from its twin was two vocabularies
    for one anatomy. The nicer JSX was not worth the second name.

    Optional, because a selection row's control LEADS instead — see `leading`.
  */
  trailing?: ReactNode
  /** the leading slot — a glyph naming the property the control edits, or the
      selection control itself for a list you tick down */
  leading?: ReactNode
  /*
    PAINT ONLY. The row's own text dims; the CONTROL's disabled state is the control's to
    pass, because a slot is opaque and this component cannot reach inside it. Half a promise
    stated plainly beats a whole one implied — the row says "this setting is unavailable",
    the control says "and you cannot operate me".

    It is the one paint-only prop left. `selected` was the other, and it went when there was
    nothing left for it to paint; this one survives because dimming the row's own words is a
    real thing only the row can do.
  */
  disabled?: boolean
  /** the line under the control: what the value resolves to, or what went wrong */
  hint?: ReactNode
  /** the id a control points at with `aria-describedby` — give it whenever `hint`
      carries words a screen reader needs with the control's state */
  hintId?: string
  /*
    WHERE THE SLOTS SIT WHEN THE TEXT IS TALLER THAN THEY ARE.

    `start` (the default) pins them to the TITLE's line, because that is what they belong
    to: a glyph or a timestamp beside a three-line explanation reads as commenting on the
    middle of the sentence when it drifts down to the block's centre.

    `center` is for the case that inverts — when the SLOT is the tall one, or when what it
    holds governs the whole block rather than the title. A 52px field pinned to a 12px line
    looks hung rather than placed; a toggle that switches everything the row says belongs
    beside all of it.

    Astryx's `Item` carries this axis and defaults the other way, to `center`. The default
    here is `start` because it was measured before it was chosen: a leading glyph beside a
    wrapped subtitle sat next to the SECOND line, and reading it as belonging to the
    explanation rather than to the thing explained is the defect that pinning fixed.
  */
  align?: 'start' | 'center'
  size?: ButtonSize
  /* THE BROWSER TOOLTIP, and it is `tooltip` because `title` is now the row's own text.
     Two different things wore that name for one commit: the words on screen and the
     hover hint. The visible one keeps it. */
  tooltip?: string
  /** data-* attributes for the row element — wire anchors, see ListItem */
  data?: Record<string, string>
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export function ListControlItem({
  title,
  subtitle,
  trailing,
  leading,
  hint,
  hintId,
  disabled = false,
  align = 'start',
  size = 'small',
  tooltip,
  data,
  style,
}: ListControlItemProps) {
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))

  return (
    <label
      className={['nd-item', 'is-ctl', `s-${size}`,
    `al-${align}`, disabled ? 'is-disabled' : '']
        .filter(Boolean)
        .join(' ')}
      title={tooltip}
      style={style}
      {...dataAttrs}
    >
      {leading != null && <span className="nd-item-leading">{leading}</span>}
      {/* the SAME text block `ListItem` renders — one anatomy, so the two rows cannot
          drift in how a title and its second line stack */}
      <span className="nd-item-text">
        <span className="nd-item-title">{title}</span>
        {subtitle != null && <span className="nd-item-subtitle">{subtitle}</span>}
      </span>
      {trailing != null && <span className="nd-item-ctl">{trailing}</span>}
      {hint != null && (
        <span className="nd-item-hint" id={hintId}>
          {hint}
        </span>
      )}
    </label>
  )
}
