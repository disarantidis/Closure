/*
  Bar — a row (or column) of cells, and nothing else. It is the DRAWING that SegmentMeter used to
  own inline, lifted out so anything can spend it: a meter, a chart column, a sparkline cell, a
  legend swatch. It carries the geometry (how many cells, how wide each, which are lit) and the
  three cell tones, and it carries no meaning — no label, no thresholds, no `<meter>`. That split
  is the kit's own: Checkbox/Radio/Switch each draw through a presentational mark the same way, and
  a Bar is that mark for the segmented family.

  TWO GEOMETRIES, ONE DRAWING, chosen by the shape of `segments`:

    UNIFORM  `segments={5}`          equal cells; `value` lights them empty→full (`ceil`, so a
                                     nonzero reading is never empty and only a full one lights the last).
    WEIGHTED `segments={[3,1,1,2]}`  cells sized to their own amounts via `flex-grow`; the widths ARE
                                     the data. A part may be `active` (the subject), `max` names the
                                     whole so a shortfall draws as an empty remainder.

  IT MEANS NOTHING ON ITS OWN, AND THAT IS THE POINT. A Bar with no `label` is decorative
  (`aria-hidden`) — the meter or chart around it carries the reading to assistive tech. Give it a
  `label` and it becomes a plain `role="img"` with that name, enough to stand alone in a cell of a
  table or a tile. It never grows a `<meter>` of its own: the moment a bar needs graded semantics it
  is a SegmentMeter, which is exactly the component that wraps this one.

  THE TONE IS INHERITED, NEVER NAMED. The lit cell is `--accent`; a weighted "other" cell is a
  dimmed accent; an empty cell is the groove. None is a colour — `--accent` re-routes with whatever
  `data-scheme` an ancestor sets, so a Bar inside `data-scheme="error"` (a meter's worst region, a
  chart's alert series) repaints without this component knowing.
*/
import type { CSSProperties, MouseEventHandler, Ref, ReactNode } from 'react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { Popover } from './Popover'
import type { PopoverSide } from './Popover'
import { isFloor, recessLevel, useLevel } from './LevelContext'

/*
  THE THICKNESS LADDER, AND `fill`. `small`/`medium`/`large`/`xlarge` are 4/8/12/16 off the spacing
  scale — a discrete cell reads as a box, so it goes chunkier than a hairline meter. `fill` is not a
  thickness at all: it stretches the bar to its container's CROSS axis, so a horizontal bar fills a
  card's height and a vertical one fills a column's width. There is no rung below `small`: it is the
  floor of the scale, and inventing a sub-4px value would be growing the scale to fit it.
*/
export type BarSize = 'small' | 'medium' | 'large' | 'xlarge' | 'fill'
export type BarOrientation = 'horizontal' | 'vertical'

/*
  THE CORNER, AS TWO SHAPES. `pill` is fully rounded at every size — the classic capsule bar.
  `rounded` is a tighter, squarer corner — a TEMPORARY raw 4px (not a token: the radius scale jumps
  6 -> 0 with nothing between, tracked in DIM-41 to add a sub-6px step). It is uniform across sizes
  for now, because a per-size raw value trips the sizes suite's rung check; once DIM-41 lands a token
  this becomes a per-size ladder. The value lives in CSS on `--nd-bar-radius`; the cells just read it.
*/
export type BarShape = 'pill' | 'rounded'

/*
  A SCHEME, PER BAR OR PER CELL — and this is the one place the kit's "tone is DERIVED, never
  declared" rule does not apply, because a Bar is a DRAWING, not a gauge. A Meter derives its
  warning from a value crossing a threshold; a Bar has no value to derive from, so a chart colouring
  a series by category, or a breakdown marking one part over-budget, is DATA — and data is declared.
  The derived rule stays with the semantic components (Meter, SegmentMeter) that WRAP this one; the
  primitive is allowed to be told. The names are the foundation's own nine schemes, and the whole
  mechanism is `data-scheme`: set on the bar it tints every cell, set on a cell it tints just that
  one, because `--accent` (and with it the lit, dimmed and — no — the groove tones) re-routes for
  whatever element carries the attribute. A cell with no scheme falls back to the bar's, then to
  whatever an ancestor (a wrapping meter) set — most specific wins, which is what "independently"
  needs.
*/
export type BarScheme = 'success' | 'error' | 'warning' | 'info' | 'brand' | 'neutral' | 'black' | 'white' | 'inverted'

/*
  A WEIGHTED CELL — the amount is the only field the drawing needs (it sets the width) plus whether
  this is the part the bar is `active` about. A name for the part belongs to whatever labels the
  bar, not to the bar; a bare number in the array is shorthand for `{ amount }` with no highlight.

  `content` is this SEGMENT's own slot — an avatar or a label laid INSIDE this cell (a stacked bar
  where each band wears a face). Unlike the whole-bar `children`/`leading`/`trailing` overlay, a
  segment's content lives in flow inside its cell, and its ink follows THAT cell's tone: white over a
  lit (`is-on`) band, `--text` over a quiet (`is-other`/groove) one. It clips to its cell, so a narrow
  band shows what fits and no more.

  `label` is the segment's ACCESSIBLE NAME — it replaces the generic "segment N of M" a clickable cell
  would otherwise announce, so a two-segment "content | action" bar can name its action band "Message"
  rather than "segment 2 of 2". Give it whenever a segment is a distinct action, not one of a series.

  `fit` makes the cell HUG its content instead of growing by its `amount`: the band is exactly as wide
  as what it holds plus its inset, and its neighbours take the room it leaves. An action band wants
  this — a "Message" or a trash icon should be its own width, not a share of the bar — and because the
  cell then has no slack, its content sits CENTRED between the equal insets for free. `amount` is
  ignored for a `fit` cell.
*/
export type BarPart = { amount: number; active?: boolean; scheme?: BarScheme; content?: ReactNode; label?: string; fit?: boolean }

export type BarProps = {
  /*
    UNIFORM READING. Optional because WEIGHTED mode derives everything from the parts' own amounts;
    pass it for `segments={number}`, leave it out for an array. No value reads as empty.
  */
  value?: number
  min?: number
  max?: number
  /** a number of equal cells, or an array of amounts that size the cells to themselves */
  segments?: number | Array<number | BarPart>
  size?: BarSize
  /*
    the corner shape — `rounded` (a soft corner) or `pill` (fully rounded). Left unset it DEFAULTS BY
    CONTENT: a bar carrying a slot (leading/children/trailing/per-segment `content`) is a `pill`, so a
    round avatar meets round ends; a bare drawing is `rounded`. Name it to override either way.
  */
  shape?: BarShape
  orientation?: BarOrientation
  /*
    A SCHEME FOR THE WHOLE BAR — one column of a chart carrying one intent. A weighted part's own
    `scheme` overrides it for that cell; an ancestor's `data-scheme` (a wrapping meter's derived
    tone) is the fallback when neither is set.
  */
  scheme?: BarScheme
  /*
    THE FOUR STATES — and a Bar wears them honestly or not at all, per INTERACTION-RULES.

    `onClick` is what turns a drawing into a TARGET: given it, the bar renders as a real `<button>`
    and earns hover/pressed/focus, because "a hover is a promise that pressing will do something".
    Without it the bar is a display, like Meter, and carries no pointer states.

    `disabled` dims the whole with the one shared knob (`--nd-dim-disabled`) and goes inert — the
    composite doctrine; it only means anything on an interactive bar.

    `readOnly` is the kit's "ink stays, box quiets": the bar keeps its full colour and value but
    stops being a target — no hover, no press, no focus, no pointer. It is how one bar sits inert
    among clickable siblings without LYING about its value the way a dim would. At rest it looks
    like any bar; the difference is that it does not answer the pointer (that is the honest limit —
    a visibly de-emphasised bar is `disabled`, which dims, not read-only, which must not).

    `loading` and `pending` are DIFFERENT states, deliberately. `loading` is the FETCHING wait — the
    bar becomes a `Skeleton` shimmer and reports `aria-busy`, "shape known, content not yet"; it
    cannot be clicked, disabled or read. `pending` is an UPCOMING value — present but not counted
    yet, a placeholder rather than a fact ("counting turns them into facts"). It is drawn as a DASHED
    OUTLINE (the segment's shape reserved, its accent bordering it, the fill left open), so it reads
    as provisional rather than as loading (a shimmer) or confirmed (a solid fill). Neither is a target.
  */
  onClick?: MouseEventHandler<HTMLButtonElement>
  /*
    MAKE EACH SEGMENT ITS OWN TARGET. Where `onClick` makes the WHOLE bar one button, `onSegmentClick`
    makes every CELL a button in its own right — the bar becomes a `role="group"` of independently
    clickable segments, each with its own hover/press/focus and its own name, reporting its index.
    The two are mutually exclusive (a button cannot nest buttons): give one or the other.
  */
  onSegmentClick?: (index: number) => void
  /*
    HOVER/FOCUS PER SEGMENT — fires the band's index as the pointer enters or focus lands on it, and
    `null` as it leaves. It is how a bar LINKS to another view: a table beside it can raise the matching
    row, and one shared popover can follow whichever band is under the pointer. It is a notification,
    not a target — it works whether or not the segments are clickable (`onSegmentClick`), so a display
    bar can drive a linked highlight without becoming a group of buttons. Pair it with `selectedSegments`
    to ring the raised band.
  */
  onSegmentHover?: (index: number | null) => void
  /*
    SELECTED — chosen among peers (a picked chart column, a highlighted bar). Drawn as a RING — a
    stroke over the bar's own fill, never colour alone (WCAG 1.4.1) — as an OUTSIDE box-shadow so
    nothing moves by a pixel when chosen. It is the `is-selected` of the three-word law: a surface
    chosen, not a control toggled (`is-on`) or a form value (`is-checked`). Pass it (even `false`) to
    opt an interactive bar into toggle semantics (`aria-pressed`); leave it out and it is not selectable.
  */
  selected?: boolean
  /*
    SELECTED SEGMENTS — the per-cell counterpart of `selected`, the way `onSegmentClick` is the
    per-cell counterpart of `onClick`. The indices given get the same ring, INDEPENDENTLY, so a
    segmented bar can carry a set of chosen cells (and each button reports its own `aria-pressed`).
  */
  selectedSegments?: number[]
  /*
    LOADING SEGMENTS — the per-cell counterpart of `loading`: the given indices become Skeleton
    shimmers while their data is fetched, each keeping its width so the bar does not reflow when a
    segment lands, the rest drawn as usual. A loading segment is never a target.
  */
  loadingSegments?: number[]
  /*
    PENDING SEGMENTS — the per-cell counterpart of `pending`: the given indices are drawn as the
    dashed UPCOMING outline while their value is not counted yet, the rest drawn as usual (a
    segmented bar where some buckets are still placeholders).
  */
  pendingSegments?: number[]
  /*
    A HOVER PANEL — rich content (a list of the items this bar stands for, with swatches and values)
    shown while the bar is HOVERED, FOCUSED, or SELECTED. It is NOT the kit's `Tooltip`, which is
    text-only by contract (WCAG 1.4.13); a list is a HoverCard, so it rides a `Popover` — exactly
    what Tooltip's own docs point to for anything richer than a string. Non-interactive content only,
    for the same reason: a surface you may lose by moving the pointer is no place for a target.
  */
  tooltip?: ReactNode
  /** which side the hover panel opens on — top by default, so it clears the bars below it */
  tooltipSide?: PopoverSide
  disabled?: boolean
  readOnly?: boolean
  loading?: boolean
  pending?: boolean
  /*
    AN OPTIONAL ACCESSIBLE NAME. Without it the bar is decorative and hidden from assistive tech —
    the correct default when a meter or chart around it already carries the reading. With it the bar
    is a `role="img"` named that, enough to stand alone.
  */
  label?: string
  /*
    A CONTENT SLOT laid OVER the bar — an avatar at the start, a name, a value on the end: a labelled
    row whose background IS the bar (a leaderboard line, a capacity row with a face on it). It rides
    an ABSOLUTE overlay so it never disturbs the cell geometry (a `role="img"` picture underneath is
    still exactly the cells), and it is DECORATION: `pointer-events: none`, so the bar's own click,
    hover and focus still reach it. Interactive content does not belong here for the same reason it
    does not belong in the hover panel — a target you cannot reliably hit is not a target. It needs
    room: only the chunky rungs (`xlarge`, `fill`) are tall enough to hold a face and text; on the
    thin rungs the slot would clip, so pair it with a chunky size.

    SIZE THE CONTENT TO THE BAR, not the other way round: the slot holds arbitrary nodes, so the bar
    cannot resize them — the caller picks the biggest that fits its box. For an Avatar that is the
    largest rung under the box height: `medium` (32) in a ~40–48px box, `large` (40) at ~52px and up.
    A too-big avatar overflows the band; a too-small one floats in it.
  */
  children?: ReactNode
  /*
    AN INTERACTIVE CONTROL laid inside the bar — a clickable avatar, a small action button, a link.
    This is the OTHER half of the content slot: `children` is decoration (inert, `pointer-events:none`),
    `leading` is a genuine target and must not be. So a
    bar that carries it stops being a `<button>` (you cannot nest a target in a target) and adopts the
    kit's HIT-LAYER shape — the same one SelectableCard flips to for a nested control (DIM-39): the
    shell is a plain box, an empty stretched `<button>` sibling carries the whole-bar `onClick` as ONE
    tab stop, and the `leading` control rises above it with its own. Like every slot the content is
    confined to the fill, so pair it with a solid/near-full bar to keep the control and label legible.
  */
  leading?: ReactNode
  /*
    A TRAILING slot — a value on the END of the fill (the figure at the tip of a leaderboard row). It
    is pinned to the RIGHT edge of the fill, INSIDE the bar, never floating out over the empty groove.
    And it earns its place: when the fill is too narrow to hold it past the leading content, it is
    DROPPED whole rather than clipped to a sliver — "if there is no free width, remove it". Decoration,
    like `children`; the reading is the bar's, not this figure.
  */
  trailing?: ReactNode
  /** an extra class to merge — for a consumer (a chart, a meter) that hangs its own layout on the bar */
  className?: string
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/*
  HOW MANY CELLS ARE LIT, in UNIFORM mode. Any progress INTO a cell lights the whole cell (`ceil`),
  so a nonzero value never reads as empty and only an exactly-full value lights the last one — the
  battery rule. Exported so it can be tested as arithmetic rather than through a rendered specimen,
  and so SegmentMeter can read the same count for its `<meter>` value and its "N of M" text.
*/
export function filledSegments(opts: { value: number; min: number; max: number; segments: number }): number {
  const { min, max, segments } = opts
  const span = max - min
  if (span <= 0 || segments <= 0) return 0
  const fraction = (clamp(opts.value, min, max) - min) / span
  return fraction <= 0 ? 0 : Math.min(segments, Math.ceil(fraction * segments))
}

export type NormPart = { amount: number; active: boolean; scheme?: BarScheme; content?: ReactNode; label?: string; fit?: boolean }

/*
  THE PARTS, NORMALISED, in WEIGHTED mode. A bare number becomes `{ amount, active:false }`; a
  negative amount is floored to zero (a part cannot take negative width). Exported for the same
  reason `filledSegments` is — the layout is arithmetic and should be testable as arithmetic.
*/
export function weightedParts(segments: Array<number | BarPart>): NormPart[] {
  return segments.map((s) =>
    typeof s === 'number'
      ? { amount: Math.max(0, s), active: false }
      : { amount: Math.max(0, s.amount), active: !!s.active, scheme: s.scheme, content: s.content, label: s.label, fit: s.fit }
  )
}

/* the whole a weighted bar is measured against: `max` when it is given and larger than the parts
   (so a shortfall shows), else the parts' own sum — a breakdown with no stated whole IS its own */
export const weightedWhole = (parts: NormPart[], max?: number) => {
  const sum = parts.reduce((t, p) => t + p.amount, 0)
  return max != null && max > sum ? max : sum
}

export const Bar = forwardRef<HTMLDivElement, BarProps>(function Bar(
  {
    value,
    min = 0,
    max,
    segments = 5,
    size = 'medium',
    shape,
    orientation = 'horizontal',
    scheme,
    onClick,
    onSegmentClick,
    onSegmentHover,
    selected,
    selectedSegments,
    loadingSegments,
    pendingSegments,
    tooltip,
    tooltipSide = 'top',
    disabled = false,
    readOnly = false,
    loading = false,
    pending = false,
    label,
    children,
    leading,
    trailing,
    className,
    style,
  },
  ref
) {
  /* the hover panel's open state — hovered/focused (`hot`), or held open by `selected`, and
     Escape/outside-press dismisses it (`shut`) until the pointer returns */
  const [hot, setHot] = useState(false)
  const [shut, setShut] = useState(false)
  const tipWrap = useRef<HTMLSpanElement>(null)
  const tipAnchor = useRef<HTMLElement | null>(null)
  const tipOpen = tooltip != null && !shut && (hot || !!selected)
  useEffect(() => {
    /* the anchor is the wrapper's first real child — a display:contents span has no box of its own */
    tipAnchor.current = (tipWrap.current?.firstElementChild as HTMLElement | null) ?? null
  }, [tipOpen])
  /*
    ─────────────────────────────────────────────────────────────────────────────────────────────────
    SLOT CONTENT — the rules that place anything put in a Bar so it always sits right. Most are enforced
    here or in `.nd-bar-content` / `.nd-bar-cell` CSS; the two marked CALLER are the consumer's to keep.

    1. WHOLE-BAR OVERLAY (`leading` / `children` / `trailing`, over a single fill):
       • confined to the FILL, never floating over the empty groove; ink is `--text-on-accent`.
       • a leading avatar takes the EQUAL inset (8/8/8) and must be sized to FILL the height — CALLER.
       • the `trailing` value takes the looser CARD end inset and DROPS whole when the fill is too narrow.

    2. PER-SEGMENT CONTENT (`BarPart.content`), the "content + action" family — kind decides placement:
       • a STRING is a text label → `has-text`: card inline inset, CENTRED (clear of the pill's corners).
       • an ELEMENT is a shape/control → `has-content`: tight EQUAL inset, START-aligned.
       • a leading shape must FILL the band's height to sit equidistant — an Avatar sized to it, or a bare
         icon in an avatar-sized square SLOT; a bare glyph left at the start crowds the corner — CALLER.
       • ink follows the CELL's tone: `--text-on-accent` over a lit band, `--text` over a quiet one.

    3. A `fit` BAND (an action): HUGS its content (no share of the bar), is at least SQUARE
       (`max(bar-height, content)` so a lone glyph is a real target), and CENTRES itself. Names itself
       through `BarPart.label`, so an icon-only action still announces "Delete", not "segment 2 of 2".

    4. SHAPE: any bar carrying slot content DEFAULTS to `pill`, so round content meets round ends.
    ─────────────────────────────────────────────────────────────────────────────────────────────────
  */
  /* each cell is its own target when `onSegmentClick` is given and the bar is not inert */
  const segmented = onSegmentClick != null && !readOnly && !loading && !pending
  /* one cell — a <button> when segments are individually clickable, else a plain <span>. The extra
     attrs (a per-part `data-scheme`, the flex-grow style) ride onto whichever element it becomes. */
  /* the part's own intent goes on FIRST, inline — a cell is its own scheme island (nested by
     design, which is the whole point of per-segment colour), and keeping the attribute the first
     thing on the tag is also what node-kit-test's data-scheme check reads */
  /* per-segment hover/focus notifications — attached to whichever element the cell becomes, so a
     LINK to another view works on a plain display bar too, not only a clickable one */
  const hoverProps = onSegmentHover
    ? (i: number) => ({
        onMouseEnter: () => onSegmentHover(i),
        onMouseLeave: () => onSegmentHover(null),
        onFocus: () => onSegmentHover(i),
        onBlur: () => onSegmentHover(null),
      })
    : () => ({})
  const cell = (i: number, cellCls: string, name: string, cellScheme?: BarScheme, cellStyle?: CSSProperties, cellContent?: ReactNode) => {
    const sel = selectedSegments?.includes(i) ?? false
    /* PADDING BY CONTENT KIND. A string is a text label — it wants card-like inline room, centred like a
       chip. Anything else is a shape or a control (an avatar that fills the height, a button that pads
       itself) — it wants the tight, equal inset so a round face sits equidistant. `has-text` vs
       `has-content` carry the two paddings; the ink rules read `.nd-bar-cell-content` either way. */
    const withContent = cellContent != null ? (typeof cellContent === 'string' ? ` has-text` : ` has-content`) : ''
    const fullCls = `${cellCls}${sel ? ' is-selected' : ''}${withContent}`
    const inner = cellContent != null ? <span className="nd-bar-cell-content">{cellContent}</span> : null
    return segmented ? (
      <button
        key={i}
        {...(cellScheme ? { 'data-scheme': cellScheme } : {})}
        type="button"
        className={`${fullCls} is-cellbtn`}
        style={cellStyle}
        disabled={disabled}
        aria-label={name}
        {...(selectedSegments != null ? { 'aria-pressed': sel } : {})}
        onClick={() => onSegmentClick!(i)}
        {...hoverProps(i)}
      >
        {inner}
      </button>
    ) : (
      <span key={i} {...(cellScheme ? { 'data-scheme': cellScheme } : {})} className={fullCls} style={cellStyle} {...hoverProps(i)}>
        {inner}
      </span>
    )
  }
  const segName = (i: number, of: number) => `${label ? `${label}, ` : ''}segment ${i + 1} of ${of}`

  /* the segments as data — tone (lit / other / empty) and any per-segment scheme, in one place */
  type Seg = { tone: 'on' | 'other' | 'off'; scheme?: BarScheme; grow?: number; content?: ReactNode; label?: string; fit?: boolean }
  let segs: Seg[]
  let remainder = 0
  /* how much of the bar reads as LIT (solid accent) vs quiet (dimmed `is-other`, groove, or shortfall),
     0..1 — the boundary the content slot's ink switches across: `--text-on-accent` over the solid
     accent, `--text` over everything lighter. In weighted mode only the ACTIVE parts are the solid
     fill (a dimmed `other` part is too light to carry white ink); in uniform it is the lit-cell
     fraction. A leaderboard's one leading active part makes this exact; scattered active parts make
     the single clip line an approximation, which is the documented limit of a one-boundary overlay. */
  let fillFraction = 1
  if (Array.isArray(segments)) {
    const parts = weightedParts(segments)
    const whole = weightedWhole(parts, max)
    remainder = Math.max(0, whole - parts.reduce((t, p) => t + p.amount, 0))
    fillFraction = whole > 0 ? parts.reduce((t, p) => t + (p.active ? p.amount : 0), 0) / whole : 0
    /* flex-grow carries the amount; a zero part still needs a hair of grow to exist */
    segs = parts.map((p) => ({ tone: p.active ? 'on' : 'other', scheme: p.scheme, grow: p.amount || 0.0001, content: p.content, label: p.label, fit: p.fit }))
  } else {
    const ceiling = max ?? 100
    const n = Math.max(1, Math.floor(segments))
    const filled = filledSegments({ value: value ?? 0, min, max: ceiling, segments: n })
    fillFraction = filled / n
    segs = Array.from({ length: n }, (_, i) => ({ tone: i < filled ? 'on' : 'off' }))
  }
  const toneCls = (t: Seg['tone']) => (t === 'on' ? ' is-on' : t === 'other' ? ' is-other' : '')

  const cellNodes = (
    <>
      {segs.map((s, i) => {
        /* a `fit` cell hugs its content (no grow, natural width); the rest grow by their amount */
        const gstyle: CSSProperties | undefined = s.fit
          ? { flex: '0 0 auto' }
          : s.grow != null
            ? { flexGrow: s.grow, flexShrink: 1, flexBasis: 0 }
            : undefined
        /* a loading segment is a Skeleton keeping its width — never a target, never a fill */
        if (loadingSegments?.includes(i)) return <span key={i} className="nd-bar-cell nd-skeleton" aria-hidden="true" style={gstyle} />
        /* a pending segment is the dashed upcoming outline — present but not counted, not a target */
        if (pending || pendingSegments?.includes(i))
          return <span key={i} {...(s.scheme ? { 'data-scheme': s.scheme } : {})} className="nd-bar-cell is-pending" aria-hidden="true" style={gstyle} />
        return cell(i, `nd-bar-cell${toneCls(s.tone)}${s.fit ? ' is-fit' : ''}`, s.label ?? segName(i, segs.length), s.scheme, gstyle, s.content)
      })}
      {/* the shortfall is never a segment — a decorative span even when the parts are buttons */}
      {remainder > 0 && <span className="nd-bar-cell" aria-hidden="true" style={{ flexGrow: remainder, flexShrink: 1, flexBasis: 0 }} />}
    </>
  )

  /* a bar that carries an interactive `leading` control adopts the HIT-LAYER shape — it can be neither
     a segment group nor inert, for the same reasons the whole-bar target cannot */
  const hasLead = leading != null && !segmented && !readOnly && !loading && !pending
  /* the WHOLE bar is a target only when it is not already a group of segment targets or a hit-layer,
     and never while it has no data (pending) or has opted out (readOnly) — the states that make hover
     a lie. When there is a `leading` control the whole-bar click moves onto the stretched hit button. */
  const interactive = onClick != null && !hasLead && !segmented && !readOnly && !loading && !pending
  const schemeAttr: Record<string, string> = scheme ? { 'data-scheme': scheme } : {}
  /*
    THE UNFILLED CELLS ARE A GROOVE, AND A GROOVE NEEDS A RUNG. `.nd-bar-cell` paints
    `background-image: linear-gradient(var(--nd-groove) 0 100%)`, and `--nd-groove` is
    declared in exactly one block, keyed on `[data-fill]` — so without the attribute the
    declaration is invalid at computed-value time and the unlit cells paint NOTHING. The lit
    ones were unaffected (they spend the accent), which is why a bar looked correct: its
    remainder was simply the page showing through.

    The recipe is Meter's and ProgressBar's, unchanged — one rung DOWN, except at the floor,
    where there is no rung below and `data-floor` hands the stylesheet its own nudge toward
    black (node.css, AND THE GROOVE IS THE SAME MECHANISM POINTED DOWN). It is spread rather
    than written inline because this component has four render shapes and a groove that only
    three of them declare is the same bug with a smaller blast radius.
  */
  const ground = useLevel()
  const grooveAttr: Record<string, string | undefined> = {
    'data-fill': isFloor(ground) ? undefined : String(recessLevel(ground)),
    'data-floor': isFloor(ground) ? '' : undefined,
  }
  /* LOADING replaces the cells with one Skeleton shimmer — the shape is known, the content is not.
     PENDING keeps the cells (they get the dashed upcoming outline in the map above), so a whole-bar
     placeholder still reads as a segmented shape rather than as one loading block. */
  const content = loading ? <span className="nd-bar-skeleton nd-skeleton" aria-hidden="true" /> : cellNodes
  /*
    THE CONTENT OVERLAY rides OVER the cells, but CONFINED TO THE FILL — its box is the lit width, not
    the whole bar (`inline-size: var(--nd-bar-fill)`, the meter-fill idiom, set inline from
    `fillFraction`). So everything it holds sits INSIDE the colour: the leading avatar at the fill's
    start, the trailing value at the fill's end, never floating out over the empty groove. Because it
    never crosses onto the groove, the ink is a single `--text-on-accent` layer — the earlier
    two-layer per-region clip is gone, replaced by "don't let content leave the fill". `overflow`
    is clipped and the box is a container (`container-type`), so the `trailing` slot can DROP whole
    when the fill is too narrow to seat it past the leading, rather than showing a half-cut figure.

    Two shapes still: a LIVE layer when there is an interactive `leading` control (announced, its
    decorative `children`/`trailing` echoed but hidden from AT so the label is not read twice), or a
    single decorative layer otherwise. Suppressed while loading — nothing to label yet. */
  const anyContent = (leading != null || children != null || trailing != null) && !loading
  const echo = (node: ReactNode, key?: string) =>
    hasLead ? (
      <span className="nd-bar-content-echo" aria-hidden="true" key={key}>
        {node}
      </span>
    ) : (
      node
    )
  const overlay = anyContent ? (
    <span
      className={`nd-bar-content${hasLead ? ' nd-bar-content-live' : ''}`}
      style={{ ['--nd-bar-fill']: `${fillFraction * 100}%` } as CSSProperties}
      {...(hasLead ? {} : { 'aria-hidden': true })}
    >
      {leading}
      {children != null && echo(children, 'c')}
      {trailing != null && (
        <span className="nd-bar-content-trailing" {...(hasLead ? { 'aria-hidden': true } : {})}>
          {trailing}
        </span>
      )}
    </span>
  ) : null
  const body = (
    <>
      {content}
      {overlay}
    </>
  )

  /* THE CORNER DEFAULTS TO PILL WHEN THE BAR CARRIES CONTENT — a round avatar wants round ends, so a
     bar with any slot (leading, children, trailing, or a per-segment `content`) is a pill unless the
     caller names `shape` outright. A bare drawing (no content) stays `rounded`. */
  const hasSlotContent =
    leading != null ||
    children != null ||
    trailing != null ||
    (Array.isArray(segments) && segments.some((s) => typeof s === 'object' && s != null && s.content != null))
  const resolvedShape: BarShape = shape ?? (hasSlotContent ? 'pill' : 'rounded')

  const cls = ['nd-bar', `s-${size}`, `sh-${resolvedShape}`, `o-${orientation}`, className ?? '', interactive ? 'is-interactive' : '', hasLead ? 'is-hit' : '', segmented ? 'is-segmented' : '', selected ? 'is-selected' : '', disabled ? 'is-disabled' : '', readOnly ? 'is-readonly' : '', loading ? 'is-loading' : '', pending ? 'is-pending' : '']
    .filter(Boolean)
    .join(' ')

  /*
    TEMPORARY per-size corner override — medium's rounded corner runs a touch tighter than the 4px the
    other rungs carry. It can ONLY live inline: a raw value on a `.s-medium` CSS rule trips the sizes
    suite's rung check (no sub-6px radius token exists — DIM-41), and the CSS scanner does not read
    inline styles. When DIM-41 lands the token this becomes a per-size ladder in node.css and drops.
  */
  const barStyle: CSSProperties | undefined =
    resolvedShape === 'rounded' && size === 'medium' ? ({ ...style, ['--nd-bar-radius']: '3px' } as CSSProperties) : style

  const barEl = hasLead ? (
    /* THE HIT-LAYER SHAPE. The shell is a plain box (never a button — it holds a target). When the
       whole bar is clickable, an empty stretched `.nd-bar-hit` <button> is a SIBLING of the content
       and carries that click as one tab stop; the `leading` control takes its own events back and
       rises above it. With no `onClick` the shell is just a named group around the control. */
    <div
      ref={ref}
      className={cls}
      style={barStyle}
      {...schemeAttr}
      {...grooveAttr}
      {...(!onClick && label ? { role: 'group', 'aria-label': label } : {})}
    >
      {onClick && (
        <button
          type="button"
          className="nd-bar-hit"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          {...(selected != null ? { 'aria-pressed': selected } : {})}
        />
      )}
      {body}
    </div>
  ) : interactive ? (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={cls}
      style={barStyle}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      {...(selected != null ? { 'aria-pressed': selected } : {})}
      {...schemeAttr}
      {...grooveAttr}
    >
      {body}
    </button>
  ) : segmented ? (
    /* not a button itself — a GROUP whose members are the buttons. The name is the group's; each
       segment names itself, so a screen reader reads "group, Storage" then "segment 3 of 5, button" */
    <div ref={ref} className={cls} style={barStyle} role="group" aria-label={label} {...schemeAttr} {...grooveAttr}>
      {body}
    </div>
  ) : (
    <div
      ref={ref}
      className={cls}
      style={barStyle}
      {...schemeAttr}
      {...grooveAttr}
      {...(loading ? { 'aria-busy': true } : {})}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {body}
    </div>
  )

  if (!tooltip) return barEl

  /*
    THE HOVER PANEL rides a Popover, and reuses Tooltip's own trick so none of the bar elements above
    had to change: a `display: contents` wrapper carries the pointer/focus handlers and generates
    no box, and its first child is what the Popover anchors to. It opens on hover/focus, is held open
    while `selected`, and Escape or an outside press shuts it until the pointer returns.
  */
  return (
    <>
      <span
        ref={tipWrap}
        style={{ display: 'contents' }}
        onPointerEnter={() => {
          setShut(false)
          setHot(true)
        }}
        onPointerLeave={() => setHot(false)}
        onFocusCapture={() => {
          setShut(false)
          setHot(true)
        }}
        onBlurCapture={() => setHot(false)}
      >
        {barEl}
      </span>
      <Popover open={tipOpen} onClose={() => setShut(true)} anchorRef={tipAnchor} side={tooltipSide} size="small" className="nd-bar-tip">
        {tooltip}
      </Popover>
    </>
  )
})
