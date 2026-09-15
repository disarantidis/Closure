/*
  ListItem — a row that belongs to nobody.

  `NodeRow` is the CARD's row — "the workhorse of the card body", and the possessive is
  exactly what this component exists to remove. Every panel that needed a row of facts
  outside a card hand-rolled one: the ProblemsDrawer's `drawer-item` buttons, the sheets'
  option rows, the token panel's lists. Same anatomy every time — something leading, a
  title, sometimes a second line, something trailing — and a different implementation
  every time, which is the five-classnames disease the kit exists to cure. This is that
  anatomy once, on the foundation: the row ladder, the text ladder, scheme-relative
  ink, edge to edge with no surface of its own at rest.

  THREE STATES, AND ONLY ONE OF THEM IS AN ACTION:

    onClick / href   the row DOES something, or GOES somewhere — a layer, a cursor, a
                     tab stop, hover
    readOnly         the row STATES something — static, at full contrast, no action
    disabled         the row is UNAVAILABLE — dimmed, out of reach

  READ-ONLY AND DISABLED ARE NOT SHADES OF EACH OTHER, which is the distinction
  `DropDownSelect` already paid for and wrote down: "a disabled control is INACTIVE — out of
  the tab order, exempt from the contrast floor. A read-only one is ACTIVE and settled:
  still legible at full contrast." A row of facts is not a row of unavailable actions, and
  dimming it would say the second while meaning the first.

  AND `readOnly` IS DECLARED RATHER THAN INFERRED FROM SILENCE. The row used to be static
  because no handler arrived, which reads the same on screen whether it was decided or
  forgotten. Saying it makes the intent legible — and the TYPE keeps the two from
  contradicting each other: `readOnly` with an `onClick` is unwritable, so a declared fact
  can never quietly carry an action.

  THIS COMPONENT HAS NO SELECTION, and that is a boundary rather than a gap. Selecting is
  what a CONTROL does, so a row that can be selected is a row with a control in it —
  `ListControlItem`. Keeping `selected` here as well would have been two components able to
  make the same claim, which is the split failing to be a split.

  THE INTERACTIVE ROW IS A LAYER, NOT THE ROW ITSELF, and this is the correction that cost
  the most to find. The row USED to BE the `<button>`, with the slots rendered inside it —
  so a Tag or a Button in `trailing` became a control nested in a control. Measured, in this
  browser, on one press: the inner handler fired AND the outer handler fired.

  It is the same defect `Tag` had already solved — "a button inside a button is invalid
  HTML" — and a peer system named the cure: Astryx calls it the INVISIBLE BUTTON PATTERN.
  So the shell is always a plain `<div>`, and a `<button>` (or `<a>`) is stretched across it
  carrying every bit of the semantics: the role, the focus, the keyboard, the name. Anything
  operable in a slot is now its SIBLING rather than its descendant, so one press is one
  action. The slots let clicks fall through to the layer (`pointer-events: none`) and real
  controls take their events back — see node.css, where that rule lives.

  IT HAS NO SELECTION, AND THE MARKS FOUND THEIR HOST ELSEWHERE. `CheckboxMark`,
  `RadioMark` and `SwitchMark` were split from their controls so a row could wear the
  drawing — and the row that does is `ListControlItem`, which hosts the real control rather
  than a drawing of one. Selecting is what a CONTROL does; a row with nothing to be selected
  BY has nothing to report.

  TONE IS A SCHEME, NOT A PROP — the Tag's rule, inherited whole. An error row is this
  component inside `data-scheme="error"`; every colour here is scheme-relative, so there
  is no `tone` to pass and no second vocabulary to learn.

  THE LABEL IS A STRING because it is the accessible name — a button row or an option row
  announced as its markup would be announced as nothing. Rich content belongs in
  `subtitle` and `value`, which are presentation and take nodes.
*/
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useId } from 'react'

/* the row ladder's rungs — a list row stands beside tags, buttons and checks,
   never in a column with 52px fields. See Checkbox for why this is `ButtonSize`. */
import type { ButtonSize } from './Button'

type ItemBase = {
  /** the row's one line of identity, and its accessible name — a string on purpose */
  title: string
  /*
    THE SECOND LINE — and a warning about its name, because the foundation owns that word
    too. `subtitle` is a TEXT STYLE in this system, and it is `body-l`: 18px, the LARGEST
    body rung, the size a line takes when it sits under a heading. This prop renders the
    opposite of that — `microcopy`, 12, recessive, pinned at every rung.

    They are not the same idea and must not be confused: the style is a heading's
    companion, this is an ANNOTATION on a title. It never climbs, because a second line
    that grew with the row would start competing with the line it explains.
  */
  subtitle?: ReactNode
  /*
    THE TWO SLOTS ARE SYMMETRIC AND THEY TAKE ANYTHING. `leading` and `trailing` are the same
    pair `Button` and `Tag` already carry, and they hold a NODE rather than a string on
    purpose: a mark, a glyph, a swatch, a Tag, a timestamp, a whole component.

    `trailing` was called `value`, which was a name for one of the things it holds rather
    than for the slot itself — and a name that narrow teaches the next reader that a fact
    is all it may contain.

    THEY DIFFER IN ONE RULE ONLY, and it is about squeezing: the LABEL gives way before
    the trailing slot does, because a truncated value is a wrong value while a truncated
    title is a shortened one.

    INK IS THE SLOT'S ONLY OPINION — plain text in either slot reads recessive, because
    text beside a title is subordinate to it. A component paints itself and is untouched:
    measured, a Tag in `trailing` keeps its own ink while the text beside it recesses.
  */
  leading?: ReactNode
  trailing?: ReactNode
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
  disabled?: boolean
  tooltip?: string
  /** data-* attributes for the row element — the board measures rows it can identify
      (a wire anchors to `[data-port]` by its live offsetTop), so a row that stands for
      a token has to keep saying which token it is */
  data?: Record<string, string>
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  AN ACTION OR A STATED FACT, NEVER BOTH — the same construction `invalid`/`describedBy`
  and DropDownSelect's `readOnly`/`onChange` use. A row that declares itself static cannot
  also carry a handler, so the declaration can never be contradicted by the code beside it.
*/
type ItemAction = ItemBase & {
  /** receives the event — a row that opens something must be able to stopPropagation,
      or opening it also deselects the node underneath (see the header) */
  onClick?: (e: ReactMouseEvent) => void
  href?: string
  readOnly?: false
}
type ItemStated = ItemBase & {
  /** the row STATES something: static, full contrast, no action. Not `disabled` — see
      the header for why those two are different claims. */
  readOnly: true
  onClick?: never
  href?: never
}

export type ListItemProps = ItemAction | ItemStated

/*
  ListItemText — the title/subtitle pair, for the OTHER end of the row.

  A row with text at both ends is one of the shapes lists actually take: a label over its
  value on the left, a heading over its detail on the right, an affordance after. The left
  pair is the row's own `title`/`subtitle`; this is the same pair, composable, for
  `trailing`.

  IT EXISTS SO THE LADDER IS NOT RE-INVENTED. A caller building that second block by hand
  picks two font sizes, and the two ends of one row drift apart — the exact defect the kit
  spent a whole audit removing from the four fields. Rendering it through the row's own
  classes means both ends read the same rungs by construction: the title at the row's type,
  the subtitle pinned to `microcopy`, recessive, never climbing.

  IT IS THE SAME SPLIT THE MARKS MADE, one level up: a piece of the row's drawing, exported
  so something else can wear it, with no semantics of its own.
*/
export function ListItemText({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <span className="nd-item-text is-end">
      <span className="nd-item-title">{title}</span>
      {subtitle != null && <span className="nd-item-subtitle">{subtitle}</span>}
    </span>
  )
}

export function ListItem(props: ListItemProps) {
  const { title, subtitle, trailing, leading, size = 'small', align = 'start', disabled = false, tooltip, data, style } = props
  const id = useId()
  const titleId = `${id}-title`
  const subtitleId = `${id}-subtitle`
  const onClick = 'onClick' in props ? props.onClick : undefined
  const href = 'href' in props ? props.href : undefined
  const readOnly = 'readOnly' in props ? props.readOnly === true : false

  const clickable = !disabled && !readOnly && (!!onClick || !!href)
  const className = [
    'nd-item',
    `s-${size}`,
    `al-${align}`,
    clickable ? 'is-clickable' : '',
    readOnly ? 'is-readonly' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))

  const body = (
    <>
      {leading != null && <span className="nd-item-leading">{leading}</span>}
      <span className="nd-item-text">
        <span className="nd-item-title" id={titleId}>
          {title}
        </span>
        {subtitle != null && (
          <span className="nd-item-subtitle" id={subtitleId}>
            {subtitle}
          </span>
        )}
      </span>
      {trailing != null && <span className="nd-item-trailing">{trailing}</span>}
    </>
  )

  /*
    THE LAYER TAKES ITS NAME FROM THE LABEL RATHER THAN CONTAINING IT. The element is
    empty — there is no text inside it to be announced — so `aria-labelledby` points at
    the title the reader can actually see, which is the same rule the fields follow: a
    visible title must BE the accessible name, not sit beside one (WCAG 2.5.3).

    The subtitle is `aria-describedby` and not part of the name, so the row announces
    "rule name, button" and offers the explanation after, instead of reading a paragraph
    where a name belongs.
  */
  const layerProps = {
    className: 'nd-item-hit',
    'aria-labelledby': titleId,
    'aria-describedby': subtitle != null ? subtitleId : undefined,
  }

  return (
    <div className={className} title={tooltip} style={style} {...dataAttrs}>
      {/* THE ROW GOES SOMEWHERE ELSE. A disabled link is a contradiction the platform
          cannot express — an <a> without href is not a link, so a disabled row simply
          renders no layer and states its fact. */}
      {href && !disabled && <a {...layerProps} href={href} onClick={onClick} />}
      {/* THE ROW DOES SOMETHING HERE — a real button, focusable and keyboard-operable,
          stretched across the row rather than wrapped around it. */}
      {!href && onClick && <button type="button" {...layerProps} disabled={disabled} onClick={onClick} />}
      {body}
    </div>
  )
}
