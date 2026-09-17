/*
  Section — a titled stretch of a region: the level between the page and the component.

  THE KIT HAD NO WORD FOR IT, so two products invented five. The 2026-09-07 census found
  the ledger holding `RowGroup` (a `div.nd-group` with a `div.nd-group-title`, 110 call
  sites in 17 files — kit CSS worn by a component the kit never shipped), three
  components named `Section` (one a grid break with an `h2` at `title-s`, two identical
  copies with an `h3` at `body-s` uppercase), an `AccHead` that re-implemented a card's
  header for an Accordion, and `mcol-head` for a column; the site has no section component
  and 26 copies of one JSX idiom. Five heading treatments for "a named block" at three type
  rungs on three elements, so the document outline and the visual rank disagreed on every
  page. SECTION-RULES a1 binds the rank to the position; this component is where the
  binding lives.

  RANK IS THE ONE AXIS. `region` is a stretch of the page (`h2`, `title-s`); `section` is a
  titled stretch of a region (`h3`, `body-s` semibold) — the default, and the thing most
  callers mean; `group` is a titled run of rows inside a section (a caption, not a heading
  — `microcopy` on a `div`, the `.nd-group` paint the ledger's RowGroup wore). A page title
  is `PageHeader`'s and a card's caption is `CardHeader`'s; neither is a rank here, so a
  Section cannot be misused as either.

  A SECTION PADS NOTHING (SECTION-RULES C.1). Its inset is its host's — the region's, or
  the card body's — and its parts get their air from `gap`, never from padding on the
  section itself. The header's actions trail in a `Cluster` at `end`; the rows follow; an
  action row, when there is one, is the caller's `FormActions` or a trailing `Cluster`, last.
  It never sets a width (C.3) or a background (C.4): a section that needs its own fill is a
  card, and the card test applies.

  A NOTE IS THE SENTENCE AFTER. Every settings page has one — "take a backup before
  choosing, if you are not sure" — and the fresh-agent dry run wrote it as a bespoke `<p>`
  because nothing in the kit was that sentence: `EmptyState` stands where rows would be,
  `sub` sits under the title. `note` is the third slot, after the body and any action row,
  at `microcopy`, recessive, at the rows' inset.

  `loading` IS `aria-busy`, AND THE SKELETONS ARE THE CALLER'S. The rule (a6) is a Skeleton
  per row at the row's height with the header standing; the component cannot know the row
  height of content it has not been given, so it announces the state once per region
  (ACCESS-RULES) and leaves the shapes to the caller — which is exactly what stops a
  spinner from appearing where the shape is known.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'
import { Cluster } from './Stack'

export type SectionRank = 'region' | 'section' | 'group'

export type SectionProps = {
  /** the title — a string, because it is the accessible name of a landmark-like block and is read as its heading */
  title: string
  /** a line under the title, `microcopy`, recessive — what this section is for */
  sub?: ReactNode
  /** the header's actions — `ghost` or `tonal` Buttons at the host's part rung, never `primary` (SECTION-RULES a2); they trail at the end edge */
  actions?: ReactNode
  /** which rank this is: a `region` of the page (h2), a `section` of a region (h3, the default), or a `group` of rows (a caption, not a heading) */
  rank?: SectionRank
  /** the section is fetching — sets `aria-busy`; the caller renders a Skeleton per row (SECTION-RULES a6) */
  loading?: boolean
  /** the rows, the form, the table, the figures — gapped at `component-2` by the section itself; a `Stack` inside is a second rung, wanted only when the parts are groups */
  children: ReactNode
  /** a sentence AFTER the rows and the action row — a caveat, an instruction ("take a backup before choosing"); `microcopy`, recessive. Not an empty state (that stands where rows would be) and not `sub` (that is under the title) */
  note?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, sub, actions, rank = 'section', loading = false, children, note, style },
  ref
) {
  const Title = rank === 'region' ? 'h2' : rank === 'section' ? 'h3' : 'div'
  return (
    <section
      ref={ref}
      className={['nd-section', `r-${rank}`].join(' ')}
      aria-busy={loading || undefined}
      aria-label={rank === 'group' ? title : undefined}
      style={style}
    >
      <div className="nd-section-head">
        <div className="nd-section-titles">
          <Title className="nd-section-title">{title}</Title>
          {sub != null && sub !== false && <div className="nd-section-sub">{sub}</div>}
        </div>
        {actions != null && actions !== false && (
          <Cluster justify="end" wrap={false}>
            {actions}
          </Cluster>
        )}
      </div>
      <div className="nd-section-body">{children}</div>
      {note != null && note !== false && <div className="nd-section-note">{note}</div>}
    </section>
  )
})
