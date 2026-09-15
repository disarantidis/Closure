/*
  Stat — a labelled figure: the one component for "a number with a name".

  FOUR VOCABULARIES FOR ONE OBJECT. The 2026-09-07 census found the ledger drawing a
  labelled figure as `Stat` (a `div.stat` with three spans, eight uses), as `Fact` /
  `Facts` (`div.msum-line`, two pages), as `FigTile` (`span.figtile`, one page), and as a
  `figure()` helper copied verbatim into eight files; the site's `StatBlock` is a fifth,
  kept bespoke "if a Meter/stat-tile primitive ever lands in the DS". SECTION-RULES a8 is
  the rule; this is the primitive: label above at `microcopy`, value at a title rung with
  tabular figures, an optional delta trailing the value.

  THE VALUE IS TYPE, NOT A TRACK. `Meter` and `ProgressBar` draw a quantity against a
  range; a stat is a quantity on its own, and COMPONENTS ("A BIG NUMBER ON ITS OWN IS
  NEITHER OF THEM") already refused to bend a track into one. The value takes the host's
  rung — `title-s` in a small card, `title-m` in a medium, `title-l` in a large — and
  `tabular-nums` so a row of stats aligns digit under digit.

  THE DELTA IS THE CALLER'S TAG. A change is a `Tag` under a scheme (`success` for up,
  `error` for down, whichever the domain means) passed in whole, because the stat cannot
  know whether up is good. It sits after the value, at the value's baseline.

  IT PADS NOTHING. The ledger's `Stat` carried `padding: 12px` on its own outer element
  and landed 30px deep beside a chart at 16 in the same card — LAYOUT-RULES' measured
  drift, and the reason a child of a card body is flush.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'
import type { CardSize } from './Card'

export type StatProps = {
  /** what the figure is — `microcopy`, above the value; a string, it names the figure */
  label: string
  /** the figure — text, tabular; a node so a unit or a currency mark can ride it */
  value: ReactNode
  /** the change — a `Tag` under the scheme the domain means; it trails the value */
  delta?: ReactNode
  /** the value's rung — the host card's size; `medium` by default */
  size?: CardSize
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const Stat = forwardRef<HTMLDivElement, StatProps>(function Stat({ label, value, delta, size = 'medium', style }, ref) {
  return (
    <div ref={ref} className={['nd-stat', `s-${size}`].join(' ')} style={style}>
      <div className="nd-stat-label">{label}</div>
      <div className="nd-stat-row">
        <div className="nd-stat-value">{value}</div>
        {delta != null && delta !== false && <div className="nd-stat-delta">{delta}</div>}
      </div>
    </div>
  )
})
