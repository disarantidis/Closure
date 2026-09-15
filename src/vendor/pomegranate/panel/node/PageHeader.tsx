/*
  PageHeader — the page's one title, first in the reading order.

  BOTH CONSUMERS HAD ONE, AND NEITHER WAS THE KIT'S. The ledger's `PageHead` (Shell.tsx, ten
  call sites) is a `header.page-head` with an `h1.page-title`, a `p.page-sub` and a
  `div.page-actions`; the site's `PageHead` (16 call sites) is a `section.pagehead` with a
  numeral eyebrow and a `h1.huge lines`. Same object, two markups, two type rungs, and on
  the site the same `huge lines` class on fourteen `div`s that are not the page title at
  all. LAYOUT-RULES a14 rules it: ONE per page, `h1` at `title-l`, an optional sub-line,
  actions trailing at the end edge, breadcrumbs above the title at `microcopy`. The page's
  primary action lives here or in a section — never in both.

  IT IS A `<header>` WITHOUT A LANDMARK ROLE OF ITS OWN: a `<header>` that is not a
  descendant of a sectioning element is the page's `banner`, which is what a page header
  is. Inside a `<main>` it is a plain header, which is also right — the shell's banner is
  the shell's.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'
import { Cluster } from './Stack'

export type PageHeaderProps = {
  /** the page's title — a string; it is the `h1` */
  title: string
  /** a line under the title — what this page is, `microcopy`, recessive */
  sub?: ReactNode
  /** the page's actions, trailing at the end edge — the one place a `primary` may stand beside the title */
  actions?: ReactNode
  /** where this page sits — a breadcrumb line above the title, `microcopy`; the caller's links */
  breadcrumb?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader({ title, sub, actions, breadcrumb, style }, ref) {
  return (
    <header ref={ref} className="nd-pagehead" style={style}>
      <div className="nd-pagehead-titles">
        {breadcrumb != null && breadcrumb !== false && <div className="nd-pagehead-crumb">{breadcrumb}</div>}
        <h1 className="nd-pagehead-title">{title}</h1>
        {sub != null && sub !== false && <div className="nd-pagehead-sub">{sub}</div>}
      </div>
      {actions != null && actions !== false && (
        <Cluster justify="end" wrap={false}>
          {actions}
        </Cluster>
      )}
    </header>
  )
})
