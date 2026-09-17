/*
  EmptyState — the sentence that stands where the rows would be.

  TWENTY-SIX HAND-WRITTEN DIVS BESIDE A COMPONENT USED TEN TIMES. The ledger has an
  `Empty` component (Rows.tsx) that renders `<div className="nd-empty">`; the 2026-09-07
  census found the same div typed out by hand 26 more times in 11 files, and a third
  spelling — `<p className="record-none">` — for the same slot on a fourth page. The
  paint (`.nd-empty` in node.css: the rows' inset, a hairline above, microcopy, recessive
  ink) was the kit's all along; the component was not, so every file re-decided the
  markup. SECTION-RULES a5 is the rule; this is the one spelling.

  IT SITS WHERE THE ROWS WOULD, INSIDE THE REGION — never above the section's header
  (Astryx: "EmptyState inside the region when a filter matches nothing"). Its inset is
  the rows' inset, which is why `.nd-empty` is written at 0 and node-kit-test §44 pins it
  there: an empty state that stepped in from the rows it replaces would be the one line in
  the section on a different left edge.

  ONE LINE, AND AT MOST ONE ACTION. An empty state says what is missing; if there is one
  thing to do about it, that is `action` — a `small` Button, trailing. An illustration, a
  heading and a paragraph is a page, not an empty section, and the kit does not draw it.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'

export type EmptyStateProps = {
  /** the sentence — what is missing, said plainly */
  children: ReactNode
  /** the one thing to do about it, if there is one — a `small` Button; it trails the sentence */
  action?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState({ children, action, style }, ref) {
  return (
    <div ref={ref} className={['nd-empty', action ? 'has-action' : ''].filter(Boolean).join(' ')} style={style}>
      <span className="nd-empty-text">{children}</span>
      {action && <span className="nd-empty-action">{action}</span>}
    </div>
  )
})
