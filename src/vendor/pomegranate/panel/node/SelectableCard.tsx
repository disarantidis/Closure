/*
  SelectableCard — a card that is a choice rather than a destination.

  IT IS A SEPARATE COMPONENT FOR THE REASON `ListControlItem` IS. Selection and navigation are
  different jobs and every peer that ships cards splits them the same way — Astryx into
  `ClickableCard` and `SelectableCard`, Carbon into `ClickableTile`, `SelectableTile` and
  `RadioTile`. A card with a `mode` prop is two components wearing one name.

  THE ROLE IS DERIVED FROM `group`, WHICH IS THE ANSWER `Menu` ALREADY GAVE. A checkable menu item
  with a `group` is a `menuitemradio` and without one is a `menuitemcheckbox`; this is the same
  question, so it gets the same answer rather than a second vocabulary. One card that can be on or
  off is a checkbox; a run of cards where exactly one is on is a radio set.

  THE ELEMENT IS A REAL `<button>`, which is what makes the keyboard work without a keydown
  handler: Enter and Space both activate a button natively, and Space is what the checkbox and
  radio patterns ask for. The ROLE is written on top of it; the ACTIVATION is the platform's.

  WHAT THIS SHAPE COSTS, STATED PLAINLY. A visually-hidden `<input type="checkbox">` inside a
  `<label>` would have given `:checked`, radio grouping, form participation and Space with no ARIA
  written at all — the trade `<progress>`, `<meter>`, `<select>` and `<dialog>` each won here, and
  the one `ListControlItem` makes by holding a real control instead of a `selected` prop. A
  `selected` prop was chosen instead, so two things are now this component's job rather than the
  platform's: `aria-checked`, written here; and the RADIOGROUP, which it cannot write because it
  does not own the run. A set of radio cards must be wrapped by the caller in a
  `role="radiogroup"` with a name — the story shows it, and without it a reader hears "radio" with
  no set to be one of.
*/
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { LevelContext, fieldLevel, useLevel } from './LevelContext'
import { forwardRef } from 'react'
import type { CardSize, CardLevel } from './Card'
import { CheckboxMark } from './CheckboxMark'
import { RadioMark } from './RadioMark'
import { SwitchMark } from './SwitchMark'
import { ConfirmIcon } from './Icon'

/*
  THE MARK IS A PICTURE OF THE CARD'S STATE, NEVER A SECOND CONTROL — and the kit already built
  the three pictures for exactly this. `CheckboxMark`, `RadioMark` and `SwitchMark` are
  presentational and `aria-hidden` by construction; CheckboxMark's own header says why: "putting a
  real <input type=checkbox> inside would say it a second time".

  A REAL CONTROL HERE WOULD BE TWO DEFECTS AT ONCE, measured rather than assumed: a card is a
  `<button>`, so a control inside it is focusable within a row that is already one tab stop, and
  one press fires BOTH — `["control", "card"]`. The same double-fire as a Button inside a menuitem.

  So a card that wants to look like a checkbox, a radio or a switch gets the MARK, driven by the
  card's own `selected`. There is one state, and one thing reading it.
*/
export type SelectableCardMark = 'checkbox' | 'radio' | 'switch' | 'tick' | 'none'

/*
  INERT INK — readOnly IS NOT disabled, and the difference is the ink, not the chrome. The kit's
  fields and marks already draw this distinction with tokens (`.nd-checkmark.is-readonly` settles
  the boundary and keeps the value; `.is-disabled` dims it), and a selectable tile that wants to be
  a day surface needs the same two states rather than the one opacity dip the card used to have.

    · `readonly`  the surface settles — a disabled fill, a settled boundary — but the VALUE keeps
                  FULL CONTRAST, because this is an answer decided elsewhere, not a control asleep.
    · `disabled`  the same settled surface, and the ink dims TOO — come back when something else is
                  true.

  Both are TOKEN paint, never opacity — opacity dims ink and chrome together, which is exactly the
  lie `readonly` exists to refuse. And both render a `<div>` OUT OF THE TAB ORDER, never a disabled
  `<button>`: an inert card is a picture of a decision, not a target.
*/
export type SelectableCardInert = 'readonly' | 'disabled'

export type SelectableCardProps = {
  /*
    THE NAME IS REQUIRED, because this is a control. A card whose whole box toggles is a checkbox
    the size of a poster, and a checkbox with no name is the unwritable thing this kit refuses.
  */
  label: string
  selected: boolean
  onSelect: () => void
  /*
    PRESENT MAKES IT A RADIO, absent makes it a checkbox — `Menu`'s derivation, reused rather than
    re-decided. The value is the set's name, and every card in one set shares it.
  */
  group?: string
  /*
    UNAVAILABLE — dims the value and drops the card from the tab order. It is the ALIAS the ticket
    allows: `disabled` is `inert="disabled"` under a shorter name, so a caller that only needs the
    one inert state need not learn the word. `inert` wins if both are given.
  */
  disabled?: boolean
  /*
    INERT INK — see `SelectableCardInert`. `readonly` keeps the value at full contrast, `disabled`
    dims it; both settle the surface from tokens (never opacity) and render a non-focusable `<div>`
    rather than a disabled `<button>`. This is Gap 1 of DIM-39: a read-only day whose number faded
    with its border would lie about the data rather than about the control.
  */
  inert?: SelectableCardInert
  /*
    A SECOND CONTROL INSIDE ONE TAB STOP — the dismiss `✕` a selected day carries. A card is a
    control; a control nested in it is focusable inside a surface that is already one tab stop, and
    one press fires BOTH (`["control", "card"]`, the double-fire measured on Menu). So `action`
    present flips the card onto `InteractiveCard`'s HIT-LAYER shape: an empty stretched `<button>`
    carries the role, name and `onSelect`; `children` and `action` are its SIBLINGS; one focus ring
    is drawn one element out; the action's own press is isolated so it never reaches selection.

    Absent, nothing changes — the card IS the button, exactly as before. This is Gap 2 of DIM-39,
    and it is the only reason a day tile could not compose `SelectableCard` before.
  */
  action?: ReactNode
  /*
    WHICH PICTURE THE CARD SHOWS, and the default is DERIVED from the same thing the role is: a
    grouped card is a radio and shows a radio, an ungrouped one is a checkbox and shows one. The
    mark and the role cannot disagree about what kind of choice this is, because neither is
    declared separately.

    `switch` is for a card that reads as on/off rather than as chosen — a setting rather than an
    option. `tick` is the plain confirmation circle. `none` is for a card whose selection is
    carried entirely by the stroke.
  */
  mark?: SelectableCardMark
  size?: CardSize
  /** which container rung fills it — see `CardLevel` */
  level?: CardLevel
  /*
    GLASS OR OPAQUE — and it is a MATERIAL choice rather than an opacity slider, because all three
    container tokens are `rgba(…, 0.5)`. There is no opaque container in this foundation.

    `blur` keeps the token translucent and frosts what is behind the card: real glass. Without it
    the token is composited over `--background` and the card is an opaque fill of the same hue —
    the honest alternative, because a translucent token painted with NO frost is a wash, which
    looks like a fill only until something moves behind it. The kit's `glass-material-test` says
    so, and it caught four of these in the kit before this prop existed.

    IT IS OFF BY DEFAULT. Frosting is a compositing cost paid per element, and a list of cards is
    the case where that bill arrives; the card that wants to sit over a photograph or a moving
    canvas asks for it.
  */
  blur?: boolean
  /** which pole the card stands on — see Card's note: it must be a prop, because a card that
      names its own `level` re-grounds itself and a strong ancestor never reaches it */
  tense?: 'tonal' | 'strong'
  children: ReactNode
  /*
    DATA-* PASS-THROUGH onto the hit-tested element — the drag in a calendar hit-tests to
    `[data-cal-date]`, and the tile is the thing under the pointer. It lands on whichever element
    IS the target: the `<button>` in the plain shape, the stretched hit `<button>` when there is an
    `action`, the `<div>` when the card is inert.
  */
  data?: Record<string, string>
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const SelectableCard = forwardRef<HTMLButtonElement, SelectableCardProps>(function SelectableCard(
  { label, selected, onSelect, group, disabled = false, inert, action, size = 'medium', level, blur = false, tense, mark, children, data, style },
  ref
) {
  const inherited = useLevel()
  const shape: SelectableCardMark = mark ?? (group ? 'radio' : 'checkbox')
  const role = group ? 'radio' : 'checkbox'
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))

  /* `disabled` is the short name for `inert="disabled"`; `inert` wins if both are set */
  const effInert: SelectableCardInert | undefined = inert ?? (disabled ? 'disabled' : undefined)

  const cls = (...extra: string[]) =>
    ['nd-selcard', `s-${size}`, `m-${shape}`, level ? `u-${level}` : '', blur ? 'is-glass' : '', selected ? 'is-selected' : '', ...extra]
      .filter(Boolean)
      .join(' ')

  /*
    THE TICK IS A PICTURE AND SAYS SO. `aria-checked` on the element already tells a reader whether
    this card is on; a second announcement from the glyph would be the same fact twice. It is
    absolutely placed so that turning it on moves nothing — a card whose content shifts when it is
    chosen reads as a layout bug rather than as a choice.

    THE MARK CARRIES THE INERT INK, NOT A SEPARATE DRAWING. `readonly` keeps the value at full
    contrast (the mark's own `readOnly` grammar: a settled boundary, an unmoved value); `disabled`
    dims it. So the card's two inert states and the mark's stay one decision, read from the same
    `effInert`.
  */
  const markSpan = shape !== 'none' && (
    <span
      className="nd-selcard-mark"
      /* the accent pole — the tick badge is an accent surface once the card is chosen */
      data-tense={shape === 'tick' && selected ? 'strong' : undefined}
      aria-hidden
    >
      {shape === 'checkbox' ? (
        <CheckboxMark size={size} checked={selected} disabled={effInert === 'disabled'} readOnly={effInert === 'readonly'} />
      ) : shape === 'radio' ? (
        <RadioMark size={size} checked={selected} disabled={effInert === 'disabled'} readOnly={effInert === 'readonly'} />
      ) : shape === 'switch' ? (
        <SwitchMark size={size} checked={selected} disabled={effInert === 'disabled'} readOnly={effInert === 'readonly'} />
      ) : selected ? (
        <ConfirmIcon />
      ) : null}
    </span>
  )

  /*
    INERT — a picture of a decision, out of the tab order. A non-focusable `<div>`, never a disabled
    `<button>`: the state is perceivable (role + `aria-checked`), and marked unavailable the way the
    fields do — `aria-disabled` for `disabled`, `aria-readonly` for `readonly`. The radio is the
    exception ARIA insists on: `aria-readonly` belongs on the radiogroup, so a read-only radio card
    settles visually and leaves the attribute to the set its caller wraps it in.
  */
  /* the level travels in React too — see LevelContext.tsx. All three shapes below publish
     it, because which shape a selectable card takes is not a thing its fields can see. */
  const ground = level ?? inherited
  /* WITHOUT an explicit level a selectable card has no island of its own, and its hover
     still has to lift: it takes the field step, the same one every other control takes.
     WITH one, `data-level` already answers and the step would fight it. */
  const fill = level ? undefined : fieldLevel(inherited)
  const island = (tree: ReactNode) => <LevelContext.Provider value={ground}>{tree}</LevelContext.Provider>

  if (effInert) {
    return island(
      <div
        className={cls('is-inert', effInert === 'readonly' ? 'is-inert-readonly' : 'is-inert-disabled')}
        role={role}
        aria-checked={selected}
        aria-label={label}
        aria-disabled={effInert === 'disabled' ? true : undefined}
        aria-readonly={effInert === 'readonly' && !group ? true : undefined}
        data-group={group}
        data-level={level}
        data-tense={tense === 'strong' ? 'strong' : undefined}
        data-fill={fill}
        style={style}
        {...dataAttrs}
      >
        {markSpan}
        <span className="nd-selcard-content">{children}</span>
      </div>,
    )
  }

  /*
    ACTION — the hit-layer shape, `InteractiveCard`'s pattern. The target is EMPTY and stretched and
    carries the role, name and `onSelect`; `children` and `action` are its siblings, so pressing the
    action fires the action and nothing else. `stopPropagation` on click AND pointerdown isolates it
    from any delegated selection handler a caller has hung on the card. One ring, drawn by the card
    one element out (`.nd-selcard:has(.nd-selcard-hit:focus-visible)`), so the card is one tab stop.
  */
  if (action != null) {
    const stop = (e: ReactMouseEvent | ReactPointerEvent) => e.stopPropagation()
    return island(
      <div className={cls('is-target')} data-level={level}
        data-tense={tense === 'strong' ? 'strong' : undefined} data-fill={fill} style={style}>
        <button
          ref={ref}
          type="button"
          className="nd-selcard-hit"
          role={role}
          aria-checked={selected}
          aria-label={label}
          data-group={group}
          onClick={onSelect}
          {...dataAttrs}
        />
        {markSpan}
        <span className="nd-selcard-content">{children}</span>
        <span className="nd-selcard-action" onClick={stop} onPointerDown={stop}>
          {action}
        </span>
      </div>,
    )
  }

  /*
    THE PLAIN SHAPE — the card IS the button, unchanged. The element is a real `<button>`, which is
    what makes Enter and Space work with no keydown handler. THE ROLE IS DERIVED, so a card cannot
    claim to be a radio and belong to no set; `name` is a data attribute rather than the real one,
    because a `<button>` has no `name` semantics and a data attribute is honest about being a
    grouping hint rather than a form field.
  */
  return island(
    <button
      ref={ref}
      type="button"
      role={role}
      aria-checked={selected}
      aria-label={label}
      data-group={group}
      data-level={level}
      data-tense={tense === 'strong' ? 'strong' : undefined}
        data-fill={fill}
      onClick={onSelect}
      className={cls()}
      style={style}
      {...dataAttrs}
    >
      {markSpan}
      <span className="nd-selcard-content">{children}</span>
    </button>,
  )
})
