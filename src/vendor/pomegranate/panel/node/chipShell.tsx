/*
  chipShell — the shared internals of the chip family (DismissChip, ToggleChip, FilterChip).

  IT IS NOT A KIT COMPONENT. It renders no shell of its own; it hands its three callers the
  pill's FACE and its class list, so the three chips differ only in the element they wrap the
  face in (a `<button>`, a `<label>`, a `<button>` + a flyout) and in their one action. The
  same move the `*Mark` files make for Checkbox/Radio/Switch: the paint is written once and the
  semantics stay with each component.

  WHY THE FAMILY SPLIT. `Chip` used to be one component with five DERIVED modes. Two of them
  (`trip`, `static`) were removed — a chip that goes somewhere is a link or a Button, and a chip
  that does nothing is a `Tag`. The three that remained each carry ONE whole-chip target, so
  they are cleaner apart than as a union that has to forbid every illegal pairing by type.

  Everything visual is still `.nd-chip`: the pill, the three materials, the rungs, the label's
  one-line truncation, the slots. Splitting the component did not fork the stylesheet.
*/
import type { CSSProperties, ReactNode } from 'react'
import { useContext } from 'react'
import { DismissIcon, CaretIcon } from './Icon'
import { Spinner } from './Spinner'
import { ChipGroupContext } from './ChipGroupContext'

/* the row ladder's rungs and the three materials — Button's, taught once */
import type { ButtonSize, ButtonVariant } from './Button'
export type ChipSize = ButtonSize
export type ChipVariant = ButtonVariant

/* the props every chip in the family shares — the resting pill, before any one action */
export type ChipBaseProps = {
  /** the label — one line, and it truncates rather than wrapping */
  children: ReactNode
  /** the chip's accessible name, when the children are not plain text */
  label?: string
  size?: ChipSize
  /** the resting material — Button's three, taught once */
  variant?: ChipVariant
  /** a glyph, a Swatch, an avatar — decoration, never a control */
  leading?: ReactNode
  /** a count Badge, a secondary glyph — decoration, never a control */
  trailing?: ReactNode
  disabled?: boolean
  /** busy, and inert while it is — takes the LEADING slot for its spinner, Button's rule */
  loading?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
  /** the full text, when the label truncates */
  title?: string
}

/* a group may set the rung for all its members, so one row cannot be ragged */
export const useResolvedChipSize = (own?: ChipSize): ChipSize => {
  const group = useContext(ChipGroupContext)
  return own ?? group?.size ?? 'small'
}

/* the class list — every state a chip can wear, in the order the stylesheet reads them */
export const chipClass = (o: {
  variant: ChipVariant
  size: ChipSize
  on?: boolean
  disabled?: boolean
  readOnly?: boolean
  loading?: boolean
  dismiss?: boolean
}): string =>
  [
    'nd-chip',
    `v-${o.variant}`,
    `s-${o.size}`,
    o.on ? 'is-on' : '',
    o.disabled ? 'is-disabled' : '',
    o.readOnly ? 'is-readonly' : '',
    o.loading ? 'is-loading' : '',
    o.dismiss ? 'is-dismiss' : '',
  ]
    .filter(Boolean)
    .join(' ')

/* the props every shell carries whatever it is — so a busy announcement, a title and the
   node-drag guard are written once rather than three times */
export const chipShared = (o: { className: string; style?: CSSProperties; title?: string; loading?: boolean }) => ({
  className: o.className,
  style: o.style,
  title: o.title,
  'aria-busy': o.loading || undefined,
  /*
    THE POLE, READ OFF THE CLASS THAT ALREADY DECIDED IT.

    A primary chip and a chosen chip are FILLED surfaces, so they stand on a pole other than the
    tonal one and `data-tense` says which — the foundation then remaps the ground and ink families
    for everything inside, which is what the four hand-written selectors in node.css used to do by
    hand.

    THE POLE IS `inverted`, NOT `strong`, AND BOTH CASES MEASURED THE SAME DEFECT. On the strong
    pole the ink is DERIVED per rung, and once the accent ladder was centred on the family's core
    shade those rungs crossed the point where black starts beating white — so a chip's label
    flipped colour with the rung it sat on: in light, black at L1 `#7B7B7B` then white from L2; in
    dark, white to L2 then black at L3 `#7B7B7B` and L4. Identical numbers to the primary Button
    that moved off the accent for the same reason. The inverted pole's ink is authored as a pair
    with its ground, so it cannot flip — and it composes with the scheme, which keeps a chip inside
    `data-scheme="error"` red rather than turning it black.

    AND A READ-ONLY CHIP IS NOT A FILLED SURFACE, which is the carve-out this regex was missing.
    `.nd-chip.is-on.is-readonly` replaces the fill with `--nd-readonly-fill` — a muted wash of the
    GROUND — while still taking the pole's ink, so fill and ink came from different families: the
    label measured **1.11:1** on the strong pole and **1.49:1** on the inverted one, `#EEEEEE` on
    `#C5C5C3`. It is the same shape as the primary Badge that painted `--text` as both its fill and
    its ink. A chip whose fill has gone back to the ground must ink from the ground too, so it
    drops the pole rather than keeping half of it.

    DERIVED FROM `className` RATHER THAN FROM THE PROPS, so the attribute and the selector the
    stylesheet matches cannot disagree: both read the same string, and a variant that stops being a
    filled surface stops being poled in one edit rather than two.
  */
  'data-tense':
    /(^|\s)(v-primary|is-on)(\s|$)/.test(o.className) && !/(^|\s)is-readonly(\s|$)/.test(o.className)
      ? ('inverted' as const)
      : undefined,
  'data-chip': true as const,
  // a press inside a control must never start a node drag
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
})

/*
  THE FACE — the slots, the label, and the ✕/caret AFFORDANCES. The ✕ and caret are drawn in an
  icon button's clothes and `aria-hidden`, because the chip around them already IS the button and
  already carries the name: a real button here would be a control inside a control, the double-fire
  the kit measured once already.

  While busy the LEADING slot IS the spinner (Button's rule, so the two agree) and it passes no
  size — `.nd-chip-slot > svg` already sizes the glyph to `--nd-chip-glyph` (1em, the chip's own
  type rung). The trailing slot survives, so a count stays readable while its subject recomputes.
*/
export function ChipFace({
  children,
  leading,
  trailing,
  loading,
  dismiss,
  caret,
}: {
  children: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  loading?: boolean
  dismiss?: boolean
  caret?: boolean
}) {
  const lead = loading ? <Spinner label="" /> : leading
  return (
    <>
      {lead != null && (
        <span className="nd-chip-slot" aria-hidden={loading || undefined}>
          {lead}
        </span>
      )}
      <span className="nd-chip-label">{children}</span>
      {trailing != null && (
        <span className="nd-chip-slot" aria-hidden>
          {trailing}
        </span>
      )}
      {dismiss && (
        <span className="nd-chip-slot nd-chip-x" aria-hidden>
          <DismissIcon />
        </span>
      )}
      {caret && (
        <span className="nd-chip-slot nd-chip-caret" aria-hidden>
          <CaretIcon />
        </span>
      )}
    </>
  )
}
