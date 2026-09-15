/*
  Accordion — a stack of disclosures, each with a header and a panel, and the set owns
  which are open at once.

  RESEARCHED THROUGH THE APG accordion pattern and Radix/Ariakit's shape of the same,
  chosen against the two alternatives already in the kit. `ChipGroup`'s disclosure is
  ONE disclosure that expands a row in place — the shape here is the same rule
  repeated N times with a group policy over the top, which is exactly the case
  `ChipGroup` cannot express (it is a chip that toggles the group's own overflow, not
  a set of headers each toggling a panel). Native `<details>`/`<summary>` was ruled
  out for two reasons the kit measures rather than assumes: it cannot enforce
  single-open without JS that fights the platform, and it does not carry
  ArrowUp/Down/Home/End between headers (APG's own keyboard contract) — a set that
  costs a keyboard user an axis of navigation is not the shape this kit ships.

  THREE HANDLES, EACH A REAL DECISION. `label` names the set (the ChipGroup rule, the
  DropDownSelect rule — an unnamed set announces as a pile of controls). `type`
  chooses which policy the set enforces — `'single'` for the classic accordion,
  `'multiple'` for a disclosure list — and it is an ENUMERATION rather than a mode
  (COMPOSITION-RULES's distinction: a value one of a known list is a value, not a
  mode, because both alternatives ship and the caller picks). `level` picks the rung
  every card in the chain stands on, so a chain of accordion items is the same
  levelled surface a chain of Cards would be.

  IT IS A CHAIN OF CARDS. Each item is a real `Card` — its own `data-level`, its own
  radius, its own padding — and the accordion is the stack. That is deliberate: the
  alternative (one card with dividers) would need padding-drift rules the level
  system already writes down elsewhere, and it is not the shape the two rulebooks
  every AGENT reads (`LAYOUT-RULES`, `COLOR-TOKEN-RULES`) point at. A stack of cards
  is the layout vocabulary the kit already speaks.

  IT DOES NOT OWN THE PANEL'S CONTENT. Callers pass whatever is a panel — text,
  lists, another Accordion, a canvas. The item is a header and a slot; what goes in
  the slot is the caller's, exactly as `Card` decided.

  KEYBOARD IS APG'S CONTRACT, EXACTLY. Enter and Space toggle the focused header.
  ArrowDown and ArrowUp move focus between headers (wrapping — one of the two APG
  variants; Radix wraps, Spectrum does not; the kit wraps because a set of three
  items with focus stuck at the last one until Tab is a smaller loop than the
  keyboard user asked for). Home and End go to the first and last header. Tab stays
  the browser's, so the set is one exit key rather than one per item.
*/
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { LevelContext } from './LevelContext'
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CardLevel, CardSize } from './Card'

export type AccordionType = 'single' | 'multiple'
export type AccordionSize = CardSize
export type AccordionLevel = CardLevel

/*
  THE SET'S POLICY IS ITS TYPE. `'multiple'` is the default because it is the honest
  shape of "some sections that can each be open" — the classic accordion is the
  stricter case that costs a caller two lines to add, but a caller who forgets to
  name the policy still lands on the shape that surprises the fewest users. Both
  values are enforced INTERNALLY: `single` writes at most one id into the open set,
  and there is no way to hand a caller-controlled `open` that violates it (the
  reducer clamps).
*/

type OpenState = string[]

type AccordionContext = {
  size: AccordionSize
  level: AccordionLevel
  type: AccordionType
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  register: (id: string, el: HTMLButtonElement | null) => void
  onHeaderKeyDown: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void
}

const AccordionCtx = createContext<AccordionContext | null>(null)

const useAccordion = (component: string) => {
  const ctx = useContext(AccordionCtx)
  if (!ctx) throw new Error(`<${component}> must be a child of <Accordion>`)
  return ctx
}

const clampSingle = (next: OpenState, prev: OpenState, id: string, opening: boolean, type: AccordionType) => {
  if (type === 'multiple') return next
  /* single: at most one open at a time. Opening any id replaces the set; closing an id
     clears it. The caller-supplied `open` prop is clamped the same way, so a controlled
     accordion cannot desync from its own type. */
  if (!opening) return prev.includes(id) ? [] : prev
  return [id]
}

const asArray = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])

export type AccordionProps = {
  /** the set's accessible name — REQUIRED (the ChipGroup / DropDownSelect rule) */
  label: string
  children: ReactNode
  type?: AccordionType
  /** the rung every item's card stands on. Defaults to level 2 (the ground) */
  level?: AccordionLevel
  size?: AccordionSize
  /** uncontrolled: which id(s) start open. Ignored if `open` is passed. Strings, or an array */
  defaultOpen?: string | string[]
  /** controlled: the set of open ids. Pair with `onOpenChange` */
  open?: string | string[]
  onOpenChange?: (open: string[]) => void
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  THE SET IS THE STACK. It is a `<div>` with the accordion's own class and — deliberately —
  no `role`: the WAI ARIA APG accordion pattern does NOT define a container role, because
  each item is its own labelled region and the group's job is the visual layout rather
  than the announcement. A `role="group"` here would announce "group" before every header,
  which is exactly the pile-of-controls noise `label` on `ChipGroup` was written to avoid
  (and it is a different case: `ChipGroup` announces because the SET is the choice; here
  the SET is a stack of INDEPENDENT choices).
*/
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  { label, children, type = 'multiple', level = 2, size = 'medium', defaultOpen, open, onOpenChange, style },
  ref
) {
  const controlled = open !== undefined
  const [uncontrolled, setUncontrolled] = useState<OpenState>(() => {
    const initial = asArray(defaultOpen)
    return type === 'single' ? initial.slice(0, 1) : initial
  })
  const openIds = useMemo(() => {
    const raw = controlled ? asArray(open) : uncontrolled
    return type === 'single' ? raw.slice(0, 1) : raw
  }, [controlled, open, uncontrolled, type])

  const headers = useRef(new Map<string, HTMLButtonElement>())

  const register = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) headers.current.set(id, el)
    else headers.current.delete(id)
  }, [])

  const commit = useCallback(
    (next: OpenState) => {
      onOpenChange?.(next)
      if (!controlled) setUncontrolled(next)
    },
    [controlled, onOpenChange]
  )

  const toggle = useCallback(
    (id: string) => {
      const currently = openIds.includes(id)
      const opening = !currently
      const raw = currently ? openIds.filter((x) => x !== id) : [...openIds, id]
      const next = clampSingle(raw, openIds, id, opening, type)
      commit(next)
    },
    [openIds, type, commit]
  )

  const isOpen = useCallback((id: string) => openIds.includes(id), [openIds])

  /*
    KEYBOARD DERIVES FROM THE DOM ORDER OF REGISTERED HEADERS, not from `children` order,
    so a `<AccordionItem hidden>` that lands in the tree but not in the layout stays out
    of the loop the way any hidden control would. `Map` preserves insertion order in ES2015+,
    which is why this uses one instead of a plain object.
  */
  const onHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
      const ids = [...headers.current.keys()]
      const i = ids.indexOf(id)
      if (i < 0) return
      const focus = (j: number) => {
        const el = headers.current.get(ids[(j + ids.length) % ids.length])
        if (el) {
          event.preventDefault()
          el.focus()
        }
      }
      if (event.key === 'ArrowDown') return focus(i + 1)
      if (event.key === 'ArrowUp') return focus(i - 1)
      if (event.key === 'Home') return focus(0)
      if (event.key === 'End') return focus(ids.length - 1)
    },
    []
  )

  /*
    IF `type` FLIPS FROM `multiple` TO `single` WHILE MORE THAN ONE ITEM IS OPEN, the set
    keeps the first open id and drops the rest. A caller changing the policy at runtime is
    a real thing (a settings toggle exposing that choice), and the alternative — silently
    keeping N open in a set that says one — would be exactly the two-states-one-stop
    collision INTERACTION-RULES names.
  */
  useEffect(() => {
    if (type === 'single' && openIds.length > 1) commit(openIds.slice(0, 1))
  }, [type, openIds, commit])

  const ctx = useMemo(
    () => ({ size, level, type, isOpen, toggle, register, onHeaderKeyDown }),
    [size, level, type, isOpen, toggle, register, onHeaderKeyDown]
  )

  return (
    <AccordionCtx.Provider value={ctx}>
      <div ref={ref} className={['nd-accordion', `s-${size}`].join(' ')} aria-label={label} style={style}>
        {children}
      </div>
    </AccordionCtx.Provider>
  )
})

/*
  THE HEADER IS A REAL BUTTON, AND THE PANEL IS A REAL REGION. `aria-expanded` on the
  button reflects the open state; `aria-controls` points at the panel's id; the panel
  is a `<div role="region" aria-labelledby>` pointing back at the button. That is the
  APG accordion pattern verbatim, and both sides of the pair are named REQUIRED by the
  type: `id` is on `AccordionItemProps`, and `header` is a `ReactNode` — not optional —
  so an item that shows nothing to press is unwritable.

  THE DISCLOSURE CARET IS OWNED BY THE ITEM, not by the caller. A caret in the caller's
  `header` slot would be a second glyph the CSS could not turn — the rotation on open
  is a design promise the kit keeps rather than a task each call site remembers to do.
*/
export type AccordionItemProps = {
  /** the item's id — the one thing the SET reads. Required, and used by aria-controls */
  id: string
  /** what the header says. A string is the common case; a node lets a leading glyph or a
      trailing badge sit beside the label. Whatever is here is the button's own contents. */
  header: ReactNode
  /** the panel's body */
  children: ReactNode
  /** disabled items are announced disabled and cannot be toggled — but they stay in the
      keyboard loop (APG: 'Arrow keys should not skip disabled headers'), because a
      keyboard user losing an item from their axis of navigation without warning is a
      worse defect than a stopover on an inert control */
  disabled?: boolean
}

export function AccordionItem({ id, header, children, disabled = false }: AccordionItemProps) {
  const { size, level, isOpen, toggle, register, onHeaderKeyDown } = useAccordion('AccordionItem')
  const headerId = useId()
  const panelId = useId()
  const open = isOpen(id)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    register(id, buttonRef.current)
    return () => register(id, null)
  }, [id, register])

  /*
    THE ITEM IS AN `.nd-card` DIRECTLY — the card's visual class, not `<Card><CardBody>`.
    That is not a shortcut. The header wants a HIT AREA the width of the whole card
    (an accordion whose click target ends at the body's padding costs a user four
    pixels on every side, which is measurable on the small size against WCAG 2.5.8's
    24-pixel floor); the LAYOUT-RULES rule "a component placed in CardBody is FLUSH"
    would leave the header inside the body's inset and the corners of the card outside
    the button's own hit box. Owning the card's own padding on the header and the
    panel is what makes the hit target and the visible corner agree, without teaching
    CardBody an exception it does not want. The `.nd-card` class supplies the fill,
    the corner, the overflow clip and the level rung; the accordion supplies the
    interior structure the same way `SelectableCard` and `InteractiveCard` do (both
    of which own their own inside for the same reason).
  */
  const cardClass = ['nd-card', 'nd-accordion-item', `s-${size}`, `u-${level}`].filter(Boolean).join(' ')
  /* an item IS a card, so it publishes its level the way Card does — see LevelContext.tsx */
  return (
    <LevelContext.Provider value={level}>
    <div className={cardClass} data-level={level}>
      <button
        ref={buttonRef}
        id={headerId}
        type="button"
        className="nd-accordion-header"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => toggle(id)}
        onKeyDown={(e) => onHeaderKeyDown(e, id)}
      >
        <span className="nd-accordion-header-label">{header}</span>
        <span className="nd-accordion-caret" aria-hidden="true" />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="nd-accordion-panel"
        hidden={!open}
      >
        {children}
      </div>
    </div>
    </LevelContext.Provider>
  )
}
