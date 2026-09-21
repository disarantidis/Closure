/*
  Stack — air between things, in one direction, at one rung.

  THE DEFECT IS A NUMBER WRITTEN TEN TIMES. The 2026-09-07 census of the ledger found the
  trailing cluster — the inline set a row or a header ends with — written as an inline
  `style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-component-N)' }}`
  at ten call sites in eight files, with N = 2 at eight of them and N = 1 at two. The same
  object, two rhythms, and nothing to say which was right. Column stacks had the same
  shape one level up: `.mcol`, `.col-stack`, `.bill-column`, `.sub-column`, `.client-column`
  — five class names, two gaps, one of them dead. SECTION-RULES a12 names the cluster;
  this file is the two components that make the rung a prop rather than a string.

  TWO COMPONENTS, ONE FILE, BECAUSE THEY ARE ONE DECISION. `Stack` runs block-wise,
  `Cluster` runs inline and wraps; both take `gap` as a rung of the component scale
  (`0`–`10`, the `--spacing-component-*` ladder), never a length. EightShapes names these
  "stack" and "inline" and calls them the primitive concepts of space; Astryx ships them as
  `VStack` / `HStack`. The kit did not, which is why the products wrote the string.

  A STACK IS NOT A SECTION. It has no title and no rank — it is air. A titled run of
  things is `Section`; a stack inside one is how the section's parts get their gap without
  the section padding itself (SECTION-RULES C.1).
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'

/* the component scale's rungs — `--spacing-component-0` … `-10`; a length never appears here */
export type Rung = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type StackProps = {
  /** which `--spacing-component-*` rung sits between the children. `3` (12) by default — a section's parts */
  gap?: Rung
  /** cross-axis alignment of the children. `stretch` by default — a stack's children fill its width */
  align?: 'start' | 'center' | 'end' | 'stretch'
  children: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack({ gap = 3, align = 'stretch', children, style }, ref) {
  return (
    <div ref={ref} className={['nd-stack', `g-${gap}`, `a-${align}`].join(' ')} style={style}>
      {children}
    </div>
  )
})

export type ClusterProps = {
  /** which `--spacing-component-*` rung sits between the members. `2` (8) by default — the trailing cluster's rung, SECTION-RULES a12 */
  gap?: Rung
  /** cross-axis alignment. `center` by default — a cluster's members share a rung and sit on one line */
  align?: 'start' | 'center' | 'end'
  /** where the members gather along the line. `start` by default; `end` is the header's actions and the action row; `between` spreads them */
  justify?: 'start' | 'end' | 'between'
  /** whether members wrap onto a second line when the container is too narrow. On by default — a cluster never overflows its row */
  wrap?: boolean
  children: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const Cluster = forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { gap = 2, align = 'center', justify = 'start', wrap = true, children, style },
  ref
) {
  return (
    <div ref={ref} className={['nd-cluster', `g-${gap}`, `a-${align}`, `j-${justify}`, wrap ? '' : 'no-wrap'].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
})
