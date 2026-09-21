/*
  Grid · Region — the page's twelve columns, and the cell a region stands in.

  THE FOURTH HANDLE, DECLARED ONCE. LAYOUT-RULES said a layout that needed a fourth handle
  was "a conversation about the foundation, not a local invention", and the 2026-09-07
  census found both consumers had invented one anyway: the ledger's `.grid` — twelve
  columns of `minmax(0, 1fr)`, spans of 3 / 4 / 8 / 12 on every page, a `fullBelow1080`
  flag on the cells that must widen on a narrow page — and the site's forty bespoke grid
  class names. A handle two products draw independently is one the foundation owes them.
  This is it: one grid, twelve columns, five legal spans, the gap at `--spacing-layout-0`
  (the ledger's 34 was `component-8`, a component rung doing a layout job; the tie rounds
  down to the layout scale's 24 — SPACING-RULES).

  A REGION IS A CONTAINER (RESPONSIVE-RULES C.3). Each cell declares `container-type:
  inline-size`, so a section inside it — a paired form, a card set, a toolbar — reflows
  by the cell's width and not the viewport's, and the same section stacks in a 3-span
  sidebar and pairs in an 8-span column without knowing which it is in. The kit's standing
  rule holds: no component carries a width `@media`.

  `fullBelow` IS THE ONE VIEWPORT AFFORDANCE, AND IT READS THE LADDER. A region that must
  take the whole row on a narrow page names a rung of RESPONSIVE-RULES' ladder — never a
  number — and the cell watches `matchMedia` for it. The numbers live in one generated
  file (`src/styles/breakpoints.ts`, from the foundation JSON, pinned by
  `tokens-drift-test`); the ledger's hand-typed 780 / 1080 / 1440 were the "13px once"
  defect at page scale.

  IT IS THE PAGE'S, NOT A CARD'S. Two columns inside a card body are `FormGrid
  layout="paired"` — the one primitive that folds by the card's own width — never a Grid
  nested in a body, which would pay the grid's layout gap inside a component inset. The
  fresh-agent dry run reached for a nested Grid because nothing said so; now it does.

  `level` MAKES THE REGION AN ISLAND, the same way `Card`'s does: it writes `data-level`
  and republishes the context, so the region is the ground its sections stand on
  (LAYOUT-RULES a2 — a region sits at a level; it never paints a background).
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useEffect, useState } from 'react'
import { BREAKPOINTS } from '../../styles/breakpoints'
import type { Breakpoint } from '../../styles/breakpoints'
import { LevelContext, useLevel } from './LevelContext'
import type { Level } from './LevelContext'

export type GridProps = {
  children: ReactNode
  /** placement only — margin belongs to the layout that holds it */
  style?: CSSProperties
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid({ children, style }, ref) {
  return (
    <div ref={ref} className="nd-grid" style={style}>
      {children}
    </div>
  )
})

/* the legal spans — LAYOUT-RULES a13. Five or seven is not a region width, it is a hole */
export type RegionSpan = 3 | 4 | 6 | 8 | 12

/*
  BELOW A RUNG OF THE LADDER — viewport-side, because this is the one thing a region may
  ask the page. `min-width` is the doctrine's direction; "below" is its complement, read
  as `max-width: rung − 1` so the rung itself is already the wide layout.
*/
const useBelow = (bp: Breakpoint | undefined): boolean => {
  const query = bp ? `(max-width: ${BREAKPOINTS[bp] - 1}px)` : null
  const [below, setBelow] = useState(() => (query && typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!query) return
    const mql = window.matchMedia(query)
    const onChange = () => setBelow(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return below
}

export type RegionProps = {
  /** how many of the twelve columns — 3 · 4 · 6 · 8 · 12, never another count */
  span: RegionSpan
  /** the rung of the ladder below which this region takes the whole row — a name, never a number */
  fullBelow?: Breakpoint
  /** the rung this region stands on; it becomes a level island for what it holds */
  level?: Level
  children: ReactNode
  /** placement only */
  style?: CSSProperties
}

export const Region = forwardRef<HTMLDivElement, RegionProps>(function Region({ span, fullBelow, level, children, style }, ref) {
  const inherited = useLevel()
  const full = useBelow(fullBelow)
  const ground = level ?? inherited
  return (
    <LevelContext.Provider value={ground}>
      <div ref={ref} className={['nd-region', `span-${full ? 12 : span}`].join(' ')} data-level={level} style={style}>
        {children}
      </div>
    </LevelContext.Provider>
  )
})
