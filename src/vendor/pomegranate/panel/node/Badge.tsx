/*
  Badge — a READING attached to a host. Never a control.

  THE PEERS WERE READ AND THEN PUT DOWN. Astryx's Badge is a status-or-category chip with
  an optional icon that must never be clickable — which is, value for value, this kit's
  static `Tag`. Building that would have been a second vocabulary for one thing, the exact
  disease the consistency sweep spent itself removing. The same spec then says what a badge
  is NOT: "durations, counts, dates and descriptions are not statuses". So the peers named
  the boundary, and what fell on the other side of it is what this kit was actually missing
  and had hand-rolled twice.

  A BADGE IS A READING; A TAG IS METADATA. That is the whole distinction, and both halves
  of it are enforced rather than described:

    Tag       a word ABOUT the thing — static metadata
    Badge     a value ON the thing — a count, a state
    Chip      the pill you can touch — where pressing and removing went

  So this type carries no handler of any kind. Not "should not"; cannot. A reading that
  responds to a press is a control with no role and no name, and the kit has spent this whole
  file making that unwritable. _(Since Chip absorbed the interactive contracts, neither Tag nor
  Badge can be pressed — the boundary between THEM is now height and target-ness, not the
  corner. See COMPONENTS.md, THE CHIP FAMILY.)_

  THE CORNER IS THE BOUNDARY, AND TAG PAID FOR IT. `Tag` explicitly refused the pill —
  node-kit-test asserts it "takes a radius rung, not the pill" — which leaves `radius-full`
  free and meaningful. Rounded rectangle is metadata; pill is a reading. Two shapes, two
  claims, told apart the way the checkbox and the radio are.

  IT DOES NOT WALK THE LADDER, AND THAT IS §14's RULE, NOT AN OMISSION. A badge is an
  ANNOTATION — it comments on a value rather than being one — so it pins to `microcopy` at
  every rung of every host, exactly as hints, counters and subtitles do. A count that grew
  with the button it rides would start competing with the label it is subordinate to. There
  is therefore no `size` prop: the host's rung moves the host, never this.

  AN EMPTY BADGE IS A DOT, AND A DOT MUST BE NAMED. With no text there is nothing to
  announce, so the state would live in colour alone — 1.4.1, and the exact failure the
  ProblemsDrawer's hand-rolled severity dot shipped with. The type refuses it: no children
  means `label` is required, the same construction `invalid`/`describedBy` and `Radio`'s
  `name` use.

  TONE IS A SCHEME. `primary` inside `data-scheme="error"` is the error badge, in both
  themes — no `tone` prop, no second vocabulary. `container` follows the same rule through
  the container fill. And because a badge is usually SLOTTED,
  it inherits the on-accent remap for free: dropped into a primary Button or a chosen
  segment it repaints itself, with nothing here to say about it.
*/
import type { CSSProperties, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { forwardRef } from 'react'
/* the materials are ONE ladder, taught once — see Tag for the same aliasing argument */
import type { ButtonVariant } from './Button'

/*
  TWO MATERIALS, WITH THE KIT'S NAMES — Button's, minus the two that would be nothing here.
  `container` is the container surface, a quiet reading and the default, because most counts are
  not news. `primary` is the accent, for the reading that must be noticed.

  `ghost` stays absent because a badge with no fill AND no stroke is plain text wearing a
  component's name, and a variant that changes nothing is a prop a caller can pass for no
  reason. It is `Exclude<ButtonVariant, 'ghost'>` — derived from the ladder rather than
  re-spelled — so a badge tracks Button's materials automatically; with `outline` gone from
  the kit that leaves `primary` and `container`.
*/
export type BadgeVariant = Exclude<ButtonVariant, 'ghost'>

type BadgeBase = {
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  A SLOT ON EITHER SIDE — `leading`/`trailing`, which is now the kit's ONLY slot vocabulary.
  Button and Tag carried `left`/`right` until the sweep that renamed 90 call sites; the logical
  pair won because it is also the correct one in a right-to-left document. A glyph before the
  count, a caret after it, an arrow for a delta.

  THE GLYPH IS `1em`, WHICH IS TAG'S RULE, NOT BUTTON'S. Button gives its slot a rung of its
  own because a button's mark reads independently of its label; inside a 16px pill there is
  no room for that argument — the glyph IS the text size, so it follows the type down to
  `microcopy` and the pill keeps its height whatever it is given.
*/
type BadgeSlots =
  | { leading: ReactNode; trailing?: ReactNode }
  | { leading?: ReactNode; trailing: ReactNode }

/* the reading is visible, so it announces itself; `label` may still replace it when the
   glyph on screen is shorter than the fact ("3" reading as "3 unresolved findings") */
type BadgeReading = BadgeBase & {
  children: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  label?: string
  variant?: BadgeVariant
}
/*
  SLOTS BUT NO TEXT — a badge whose whole reading is a glyph. Nothing here announces itself,
  so the NAME is required, exactly as it is for the dot and for every `labelHidden` control
  in the kit: an icon-only anything with no name is the unwritable control this kit exists to
  prevent.
*/
type BadgeGlyph = BadgeBase & BadgeSlots & { children?: never; label: string; variant?: BadgeVariant }
/*
  NOTHING AT ALL — so the name is required, or the state lives in colour alone. And for the
  same reason the MATERIAL narrows: a dot is 8px of pure fill with no text to carry it, so
  the fill has to hold 1.4.11's 3:1 by itself. `container` cannot — measured on the specimen
  sheet at 1.1:1 against the page, which is not a faint dot but an invisible one. So the type
  excludes it, leaving `primary` — the accent fill — as the material a dot can wear.
*/
type BadgeDot = BadgeBase & {
  children?: never
  leading?: never
  trailing?: never
  label: string
  variant?: Exclude<BadgeVariant, 'tonal'>
}

export type BadgeProps = BadgeReading | BadgeGlyph | BadgeDot

/*
  IT FORWARDS ITS REF, so it can be a Tooltip's trigger or a Popover's anchor. Those two clone
  or measure the element they are given, and a component that swallows the ref leaves them
  pointing at nothing — React says so out loud ("Function components cannot be given refs"),
  which is exactly how this was found: a Tooltip round a truncated Tag warned twice on mount.
*/
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(props, ref) {
  const { style } = props
  const children = 'children' in props ? props.children : undefined
  const leading = 'leading' in props ? props.leading : undefined
  const trailing = 'trailing' in props ? props.trailing : undefined
  const label = props.label
  /* a dot is the badge with NOTHING in it — not merely without text, since a glyph badge has
     no text either and is a very different shape */
  const isDot = children == null && leading == null && trailing == null
  /* the default follows the shape: a reading is quiet unless asked otherwise, a dot has no
     quiet option to fall back to */
  const variant: BadgeVariant = props.variant ?? (isDot ? 'primary' : 'tonal')

  /*
    ONE THING TO SHOW IS A CIRCLE, AT EVERY HEIGHT. A single digit and a single glyph are the
    same reading — "one" — and the pill only earns its length when there is more than one
    thing in it. Left to the base drawing they came out ovals, and for two different reasons:
    a digit sat in a 16-wide minimum that stayed 16 while the host compressed the height to
    12, and a glyph carried the padding a word needs on both sides of something already
    square.

    So the shape is DERIVED FROM THE CONTENT rather than declared by the caller — the kit's
    rule for interactivity, applied to geometry. There is no `round` prop to get wrong, and
    no way to ask for a circle around a word.
  */
  const text = typeof children === 'string' || typeof children === 'number' ? String(children).trim() : null
  const slots = (leading != null ? 1 : 0) + (trailing != null ? 1 : 0)
  const isRound =
    !isDot && ((text != null && text.length === 1 && slots === 0) || (children == null && slots === 1))

  return (
    <span
      ref={ref}
      className={['nd-badge', `v-${variant}`, isDot ? 'is-dot' : '', isRound ? 'is-round' : '']
        .filter(Boolean)
        .join(' ')}
      /* one rung off its ground — see LevelContext.tsx */
      data-fill={fieldLevel(useLevel())}
      /* the pole — primary IS a filled surface, so it reads the poled family
         under the ground family's names and paints --background like everything else */
      /*
        PRIMARY IS THE INVERTED SURFACE — see Button.tsx for the whole argument. Short version: it
        only looked like the accent while the accent was an absolute, and centring the accent
        ladder on the core shade made its ink FLIP mid-ladder, because the strong pole derives ink
        per rung. The inverted pole's ink is authored as a pair with its ground, and it is a POLE
        rather than `data-scheme="inverted"` so a destructive one stays red.
      */
      data-tense={variant === 'primary' ? 'inverted' : undefined}
      style={style}
      /* a dot and a glyph badge have no text of their own, so they carry the reading as a
         name and announce as ONE thing — which is also why the slots are `aria-hidden` below.
         A badge WITH text is named by that text unless the caller says the fuller fact */
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {leading != null && (
        <span className="nd-badge-slot" aria-hidden>
          {leading}
        </span>
      )}
      {children}
      {trailing != null && (
        <span className="nd-badge-slot" aria-hidden>
          {trailing}
        </span>
      )}
    </span>
  )
})
