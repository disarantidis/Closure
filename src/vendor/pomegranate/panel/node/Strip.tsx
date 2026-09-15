/*
  Strip — a row of records you pick one from, above the thing the pick filters.

  ONE CONSTRUCT, THREE COPIES. The ledger's `ClientStrip`, `MemberStrip` and
  `PropertyStrip` are the same markup — a `div[role=radiogroup]` of `SelectableCard`s with
  a roving tab stop and arrow keys across — written three times at three card sizes
  (`large`, `medium`, and none), and placed inside the page grid on two pages and outside
  it on the third. SECTION-RULES a13 is the rule: one component, one card size per app.
  The ledger's own header for the pattern is the argument for it — "learning the month
  strip should be enough to know this one, which is the whole argument for repeating a
  pattern rather than inventing a second list treatment for a second kind of record".

  THE CARDS LIFT ONE RUNG OFF THE GROUND THEY STAND ON — `neighbourLevel(useLevel())`,
  the rung beside, exported once (SECTION-RULES C.2). A strip stands on the page, and a
  level-less card there would take the ground's rung and merge into it; the lift is what
  makes it read as a card, and the foundation's ladder says how far a lift goes.

  A RADIOGROUP, BECAUSE IT IS ONE. Exactly one item is selected; the selected card is the
  one tab stop; arrows, Home and End move the selection and the focus together, the way
  a radio group does (ACCESS-RULES: the tab-stop models). `label` is required — a group
  without a name is the unwritable state COMPOSITION-RULES C.3 exists for.

  A RADIOGROUP OF RADIOS, NOT CHECKBOXES — the bug this file shipped with (DIM-44). Each
  card's role and mark both derive from `SelectableCard`'s own `group` prop
  (`shape = mark ?? (group ? 'radio' : 'checkbox')`, `role = group ? 'radio' : 'checkbox'`),
  and this file never passed one — so the outer `role="radiogroup"` held a set of
  `role="checkbox"` children, each drawing a checkbox tick, which announces as
  multi-select to a screen reader and reads as multi-select to a sighted one. `useId()`
  gives every render of a Strip its own group; `mark="none"` keeps the selection stroke-
  only, matching what the three hand-rolled strips this component replaced drew before
  they adopted it (`ClientStrip`'s own `group="cstrip"` / `mark="none"`, DIM-44's repro).
*/
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { forwardRef, useEffect, useId, useRef } from 'react'
import type { CardSize } from './Card'
import { neighbourLevel, useLevel } from './LevelContext'
import { SelectableCard } from './SelectableCard'

export type StripItem = {
  id: string
  /** the record's name — the card's label and its accessible name */
  label: string
  /** a line under the name, `microcopy`, recessive — a figure, a count, a status */
  sub?: ReactNode
  /** a mark before the name — an Avatar, an Icon */
  leading?: ReactNode
}

export type StripProps = {
  /** the group's accessible name — REQUIRED; "Pick a client" */
  label: string
  items: StripItem[]
  /** the id of the selected item — exactly one, the caller's state */
  selected: string
  onSelect: (id: string) => void
  /** the cards' size — one per app; `medium` by default */
  size?: CardSize
  /** placement only */
  style?: CSSProperties
}

export const Strip = forwardRef<HTMLDivElement, StripProps>(function Strip({ label, items, selected, onSelect, size = 'medium', style }, ref) {
  const level = neighbourLevel(useLevel())
  const group = useId()
  const cards = useRef<Array<HTMLButtonElement | null>>([])

  /* the roving tab stop: the selected card is the one stop, the rest step out */
  useEffect(() => {
    cards.current.forEach((el, i) => {
      if (el) el.tabIndex = items[i]?.id === selected ? 0 : -1
    })
  })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = cards.current.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
    if (to == null) return
    const at = Math.max(0, Math.min(items.length - 1, to))
    const next = items[at]
    if (!next) return
    e.preventDefault()
    onSelect(next.id)
    cards.current[at]?.focus()
  }

  return (
    <div ref={ref} className={['nd-strip', `s-${size}`].join(' ')} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} style={style}>
      {items.map((it, i) => (
        <SelectableCard
          key={it.id}
          ref={(el) => {
            cards.current[i] = el
          }}
          size={size}
          level={level}
          label={it.label}
          selected={it.id === selected}
          onSelect={() => onSelect(it.id)}
          group={group}
          mark="none"
        >
          <div className="nd-strip-item">
            {it.leading != null && it.leading !== false && <span className="nd-strip-item-leading">{it.leading}</span>}
            <span className="nd-strip-item-text">
              <span className="nd-strip-item-label">{it.label}</span>
              {it.sub != null && it.sub !== false && <span className="nd-strip-item-sub">{it.sub}</span>}
            </span>
          </div>
        </SelectableCard>
      ))}
    </div>
  )
})
