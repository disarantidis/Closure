/*
  Skeleton — the shape of content that has not arrived yet.

  IT IS A SHAPE, NOT A SPINNER, and that is the whole reason it exists beside one. A
  spinner says "something is happening"; a skeleton says "something of THIS SIZE is
  happening here", which is what stops the page from jumping when the data lands. So
  every prop here is about geometry and nothing is about the animation — the wave is
  the stylesheet's business (see the SKELETON block in node.css), and a call site that
  could re-time it could also put two of them out of step on the same screen.

  THE WAVE IS ONE WAVE ACROSS THE WHOLE PAGE, AND THERE IS NOTHING TO WIRE UP. Every
  skeleton on screen — in this figure, in a sibling component, in a list rendered by
  code that has never heard of this one — shows the same crest at the point it has
  reached. Two of them side by side are in step because the wave belongs to the
  viewport rather than to either of them; see the SKELETON note in node.css for how
  (`background-attachment: fixed`, and a tilt so vertical stacks ripple too).

  This component therefore takes NO ordering prop. An earlier draft had an `index` for
  hand-threading the stagger, and it was the wrong shape: it only worked when one
  caller happened to render every skeleton in the figure, which is exactly the case
  that did not need help.

  AND JAVASCRIPT DOES NOT HAVE TO SHARE A CLOCK EITHER, which is worth writing down
  because the opposite is so plausible. A CSS animation starts when its element mounts,
  so a skeleton appearing two seconds into a wait looks like it must need a negative
  `animation-delay` to drop it into the cycle already running. This component had
  exactly that — a session epoch, a phase stamped per instance — until it was measured:
  two identical animations created 1.5s apart, outside React, reported byte-identical
  `background-position` at every sample, and the one carrying the "correction" was the
  only one out of step. The compensation was creating the drift it was written to fix.

  So there is no clock here. Identical animations agree on their own, and the honest
  version of this component is the one that does not interfere. Even in a browser that
  did start a late animation cold, the spatial half of the wave still holds — the
  gradient is anchored to the viewport either way — so the failure mode is one element
  briefly out of phase, not a page of unrelated shimmers.

  IT IS PRESENTATIONAL: no timers, no state, no knowledge of what it is standing in for.
  The `label` follows the Spinner's contract exactly — announced by default, silenced
  with `label=""` when the skeleton sits beside its own already-announced heading, so a
  screen reader is told "loading" once rather than once per bar.
*/
import { recessLevel, useLevel } from './LevelContext'
export type SkeletonShape = 'text' | 'block' | 'circle'

export function Skeleton({
  shape = 'text',
  lines = 3,
  width,
  height,
  size = 40,
  label = 'Loading',
}: {
  /** 'text' for a paragraph of bars, 'block' for a rectangle, 'circle' for an avatar. */
  shape?: SkeletonShape
  /** How many bars the `text` shape draws. The last one is short, like a real paragraph. */
  lines?: number
  /** Any CSS width. On `text` it overrides the full-width bars; the short last one keeps its own. */
  width?: number | string
  /** Any CSS height — `block` only; `text` takes its height from the type it replaces. */
  height?: number | string
  /** Diameter of the `circle` shape, in px. */
  size?: number
  /** Announced to screen readers; pass '' for a skeleton beside its own announced label. */
  label?: string
}) {
  /* one announcement per figure, never one per bar — the same choice the Spinner makes,
     for the same reason: the bars are one loading state wearing several boxes */
  const a11y = label ? ({ role: 'status', 'aria-label': label } as const) : ({ 'aria-hidden': true } as const)
  /*
    A SKELETON IS A RECESS, ONE RUNG DOWN — `recessLevel`, which steps UP at the floor because
    there is nothing beneath the bottom rung. `--nd-recess` is declared in the one `[data-fill]`
    block, so without this attribute `background: var(--nd-recess)` is invalid at computed-value
    time and the bars paint nothing: a loading state that shows no loading.
    Unlike a groove this needs no `data-floor` — `recessLevel` answers L1 with a real rung (3),
    which is the table the old `--container-3` case already used.
  */
  const fill = recessLevel(useLevel())
  if (shape === 'circle') {
    return <span className="nd-skeleton nd-skeleton-circle" data-fill={fill} {...a11y} style={{ width: size, height: size }} />
  }

  if (shape === 'block') {
    return <span className="nd-skeleton nd-skeleton-block" data-fill={fill} {...a11y} style={{ width, height }} />
  }

  return (
    <div className="nd-skeleton-lines" {...a11y}>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="nd-skeleton nd-skeleton-text"
          data-fill={fill}
          style={{
            /* the short last line is what makes a stack of bars read as a paragraph
               rather than a table — skipped at lines={1}, where there is no paragraph
               to suggest and a 62% bar would just look like a mistake */
            width: lines > 1 && i === lines - 1 ? '62%' : width,
          }}
        />
      ))}
    </div>
  )
}
