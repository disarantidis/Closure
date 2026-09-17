/*
  Tag — a short piece of metadata attached to something. Static, and only static.

  IT USED TO HAVE THREE MODES, and giving them up is the point. `Tag` carried static,
  interactive and dismissible — derived from `onTrigger` and `onDismiss` — and every mature
  kit does split the family that way. What none of them do is split it inside ONE component
  while a second component in the same kit also owns pressing and removing. That was this
  kit's position once `Chip` existed, and it is the duplicate vocabulary the consistency
  sweep spent itself removing.

  So the survey (Components/The chip family) settled it: CHIP IS THE PILL YOU CAN TOUCH, and
  Tag is the rounded rectangle you cannot. It is the split Primer already draws — Label is
  static, Token is the one you can reach — and it cost exactly one call site to make,
  in the board app that has since been deleted around it.

  WHAT THAT LEAVES, and it is a real component rather than a leftover: a word ABOUT
  something, at a target-sized rung so a row of them keeps its rhythm, painted by the scheme
  it stands in. No tab stop, no handler, nothing to announce beyond its own text.

  THE CORNER IS NO LONGER THE BOUNDARY. It used to be: Tag refused `radius-full` so the pill
  could mean "a reading" for `Badge`. Chips are pills too now, so the corner cannot carry
  that weight, and the boundary moved somewhere measurable — a Badge is `component-4` (16)
  and can never be pressed; a Chip is `spacing.group.target.minimum` (24) or more and always
  can; a Tag is target-sized like a chip and, like a badge, cannot be pressed. Three
  components, two questions, no ambiguity.

  EVERY TAG IS AT LEAST ONE TARGET WIDE AND TALL, even now that none of them is a target.
  `spacing.group.target.minimum` is the foundation's floor for something a finger has to hit,
  and a static tag sitting in a row of chips must not be shorter than they are or the row
  stops being a row.

  TONE IS A SCHEME, NOT A COLOUR PROP. The foundation resolves nine schemes and every role
  this component reads repaints with the one it sits in. A `tone="error"` prop would be a
  tenth vocabulary for something the token chain already says.
*/
import type { CSSProperties, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { forwardRef } from 'react'
/* the canonical ladder types — Tag's own names are ALIASES of these, see below */
import type { ButtonSize, ButtonVariant } from './Button'

/*
  THE NAME IS THE RUNG, AND THE RUNG IS A HEIGHT — 24 and 32, which is what `small` and
  `medium` mean everywhere on the INLINE ladder: here, on Checkbox, and on Button.

  This used to read `'small' | 'large'`, and its `large` was 32 — the same 32 Button calls
  `medium`. Two components in one row, one height, two names: the exact thing that makes a
  designer reach for `large` on a tag beside a `medium` button and get a match by accident
  rather than by asking for one.

  All three rungs are here now — 24, 32 and 56, the row ladder — so a tag carries every rung a
  row can need. The three size WORDS are shared with Button, and so is the TYPE: this is an ALIAS
  of `ButtonSize`, not a second union that happens to match — two identical literals drift the
  day one of them gains a rung, and the compiler would never say a word, because to it they
  were always two types. An alias cannot drift. `ButtonSize` is the canonical name because Button
  declared the full three-word union first. The alias is over the WORDS, not the heights: `large`
  is 56 on both, but a `small` tag is 24 where a `small` button is 32.
*/
export type TagSize = ButtonSize
/*
  THE SAME THREE MATERIALS THE BUTTON HAS, AND THE SAME THREE NAMES. The kit already
  decided that a variant is a MATERIAL rather than a colour, and taught that ladder
  once — primary is the accent opaque, container is the container, ghost is neither. A tag
  that invented `solid / soft / quiet` would be the same three things under a second
  vocabulary, which is how a kit ends up needing a translation table. What each rung
  MEANS is necessarily a tag's own question, since a tag is metadata rather than an action:

    primary   the accent, opaque       — the tag that IS the state (in a scheme: the
                                         error tag, the success tag). Loudest; one per row.
    container     the container surface    — the default. Metadata that reads as an object.
    ghost     no fill, no stroke       — metadata inside something that is already an
                                         object; the tag as a piece of text with a target

  Colour is still not on this axis: `primary` in `data-scheme="error"` is the red tag,
  and the on-accent pairing is audited by the foundation rather than chosen here.

  An ALIAS of `ButtonVariant` for the same reason `TagSize` aliases `ButtonSize`: the three
  materials are ONE ladder taught once, and only an alias lets the compiler know that.
*/
export type TagVariant = ButtonVariant

type Base = {
  variant?: TagVariant
  size?: TagSize
  /** anything before the label — a status dot, a count, a glyph. `leading`, not `left`: the
      kit settled on the logical pair, and `left` is a promise that breaks in a RTL document */
  leading?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/* A NODE LABEL STILL HAS TO SAY WHAT IT IS. Text announces itself; a glyph or a count does
   not, so passing a node makes `label` required. It is the same shape Button uses for its
   slot-only case — and the one part of the old two-target contract worth keeping, because it
   was never about the remove button. It was about the tag being readable. */
type TextLabel = Base & { children: string; label?: string }
type NodeLabel = Base & { children: ReactNode; label: string }

/*
  IT FORWARDS ITS REF, so it can be a Tooltip's trigger or a Popover's anchor. Those two clone
  or measure the element they are given, and a component that swallows the ref leaves them
  pointing at nothing — React says so out loud ("Function components cannot be given refs"),
  which is exactly how this was found: a Tooltip round a truncated Tag warned twice on mount.
*/
export const Tag = forwardRef<HTMLSpanElement, TextLabel | NodeLabel>(function Tag(props, ref) {
  const { variant = 'tonal', size = 'small', leading, style, children } = props

  /* a tag lifts one rung off the ground it sits on — the step the stylesheet used to
     spell as an absolute rung, computed here because only the DOM knows it now
     (LevelContext.tsx) */
  const fill = fieldLevel(useLevel())
  const className = ['nd-tag', `v-${variant}`, `s-${size}`].join(' ')

  const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''

  /*
    A SPAN, ALWAYS — there is no longer a branch. The old component chose between a button
    shell, a span with an inner hit button, and a bare span, because it had one, two or zero
    targets. A static tag has zero, so the markup that survives is the one that was already
    correct for that case.
  */
  /* primary is the INVERTED surface, not the accent — see Button.tsx for why this is a
     pole and not `data-scheme="inverted"`: destructive is a scheme, and a control that
     writes its own scheme overrides the one its app put it in */
  return (
    <span ref={ref} className={className} data-fill={fill} data-tense={variant === 'primary' ? 'inverted' : undefined} style={style} aria-label={typeof children === 'string' ? undefined : props.label}>
      {slotted(leading) && <span className="nd-tag-slot">{leading}</span>}
      <span className="nd-tag-label">{children}</span>
    </span>
  )
})
