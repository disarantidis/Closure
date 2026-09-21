/*
  The node kit — the card the canvas is built from, rebuilt.

  ANATOMY, from the outside in:

    NodeCard        the shell: white, rounded, one soft shadow
      NodeHeader    icon · title · menu. Plain — no coloured band across it
      NodeRow…      the rows, which are the interesting part
      NodePort      the connection points, on the card's edge

  THE ROWS ARE THE COMPONENT. A node is a small table of facts about one thing,
  and the reference reads well because it gives those facts exactly three shapes
  and never mixes them:

    · `meta`     tinted, leading icon, label left / value right. Standing facts
                 about the node itself — cadence, duration. The tint is what
                 makes them read as chrome rather than content.
    · `plain`    untinted, label left / value right. The node's actual data.
    · `stacked`  label above, value below, value in mono. For values too long to
                 sit on one line — a URL, an expression, a token path.

  …plus `NodeRowGroup`, a titled run of plain rows ("Last run" over its parts).
  A row that goes somewhere is a <button> and says so on hover and on focus; a
  row that is only a fact is a <div> and cannot be tabbed to. That distinction is
  the accessibility of this whole surface, so it is a prop that changes the tag,
  not a class someone remembers to add.

  Everything here is presentational and takes no board state, which is what makes
  it designable in isolation — and what let it outlive the board app it was drawn
  for, which has since been deleted around it.
*/
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ClockIcon, MenuIcon } from './Icon'
import { iconFor } from './nodeIcons'
import { glassLightRef } from './glassLight'
import { Tag } from './Tag'
import type { NodeKind } from './nodeKinds'

/* ---- the card ------------------------------------------------------------------- */

/** `muted` is the row that is present but empty — a count of zero, a slot nothing
    fills yet. It is information, not a fault, so it recedes rather than alarming:
    the first migrated body reached for `negative` and turned "nothing uses this
    yet" bright red. */
export type NodeTone = 'default' | 'accent' | 'positive' | 'negative' | 'muted' | 'warning'

export function NodeCard({
  kind,
  title,
  generative = false,
  selected = false,
  dimmed = false,
  lit = false,
  self = false,
  width,
  minHeight,
  x,
  y,
  nodeId,
  tint,
  tag,
  engine,
  menu = true,
  onMenu,
  actions,
  port,
  badge,
  onHeaderPointerDown,
  onDoubleClick,
  onPointerDown,
  onClickCapture,
  onMouseEnter,
  onMouseLeave,
  children,
  style,
}: {
  kind: NodeKind | string
  title: ReactNode
  generative?: boolean
  selected?: boolean
  /** the focus pass: `self` is the node under the pointer, `lit` is something it
      reaches, `dimmed` is everything else */
  dimmed?: boolean
  lit?: boolean
  self?: boolean
  width?: number
  minHeight?: number
  /** world coordinates. Given these, the card places ITSELF — it is the
      positioned element, not something inside a positioned wrapper. */
  x?: number
  y?: number
  /** becomes `data-usernode`, which hit-testing and wire-drop read. Without it a
      wire dropped on this card connects to nothing, silently. */
  nodeId?: string
  /** the maturity lens tint — a card coloured by how well it documents itself */
  tint?: string
  tag?: ReactNode
  /** a station's grain — "token", "whole file", "unwired" */
  engine?: ReactNode
  menu?: boolean
  onMenu?: () => void
  /** the trailing action pair — edit, delete */
  actions?: ReactNode
  /** the free-wire port. A direct child, so semantic zoom hides it with the body. */
  port?: ReactNode
  badge?: ReactNode
  /** the DRAG HANDLE lives on the header, which is why it is a prop here rather
      than something a caller wraps around it */
  onHeaderPointerDown?: (e: ReactPointerEvent) => void
  onDoubleClick?: () => void
  onPointerDown?: (e: ReactPointerEvent) => void
  onClickCapture?: (e: ReactMouseEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      ref={glassLightRef}
      data-usernode={nodeId}
      className={[
        'nd-nodecard',
        `kind-${kind}`,
        generative ? 'is-generative' : '',
        selected ? 'is-selected' : '',
        self ? 'is-focus-self' : lit ? 'is-focus-lit' : dimmed ? 'is-focus-dim' : '',
        tint ? 'is-lensed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...(x != null ? { left: x, top: y } : null),
        ...(width != null ? { width } : null),
        ...(minHeight != null ? { minHeight } : null),
        ...(tint ? ({ ['--nd-tint']: tint } as CSSProperties) : null),
        ...style,
      }}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <NodeHeader
        kind={kind}
        title={title}
        generative={generative}
        badge={badge}
        tag={tag}
        engine={engine}
        menu={menu}
        onMenu={onMenu}
        actions={actions}
        onPointerDown={onHeaderPointerDown}
      />
      {children}
      {port}
    </div>
  )
}

export function NodeHeader({
  kind,
  title,
  generative = false,
  badge,
  tag,
  engine,
  menu = true,
  onMenu,
  actions,
  onPointerDown,
}: {
  kind: NodeKind | string
  title: ReactNode
  generative?: boolean
  badge?: ReactNode
  tag?: ReactNode
  engine?: ReactNode
  menu?: boolean
  onMenu?: () => void
  actions?: ReactNode
  onPointerDown?: (e: ReactPointerEvent) => void
}) {
  const Glyph = iconFor(kind, generative)
  return (
    // `nd-head` is the DRAG HANDLE and the one child semantic zoom keeps. Both
    // facts are load-bearing: the LOD tier selects `.nd-nodecard > *:not(.nd-head)`,
    // so anything that is not this disappears at survey altitude.
    <div ref={glassLightRef} className="nd-head" onPointerDown={onPointerDown}>
      <span className="nd-glyph" aria-hidden>
        <Glyph size={15} />
      </span>
      {/* a WORD about the node — metadata, so a Tag. It used to be `.nd-badge`, which drew
          a Tag by hand and set a `font-weight` the foundation forbids; the badge that
          replaced that class is a READING (a count, a dot) and this is not one. */}
      {badge != null && (
        <Tag size="small" variant="tonal">
          {typeof badge === 'string' ? badge : String(badge)}
        </Tag>
      )}
      <span className="nd-title">{title}</span>
      {engine != null && <span className="nd-engine">{engine}</span>}
      {tag != null && <span className="nd-headtag">{tag}</span>}
      {actions}
      {menu && (
        <button ref={glassLightRef} type="button" className="nd-menubtn" aria-label="actions" onClick={onMenu}>
          <MenuIcon size={14} />
        </button>
      )}
    </div>
  )
}

/* ---- the rows ------------------------------------------------------------------- */

type RowCommon = {
  /** giving a row an onClick makes it a real <button>: focusable, keyboard-
      operable, and visibly interactive. A row without one is inert by
      construction rather than by whoever remembered.

      It RECEIVES THE EVENT, which is not incidental. The board's root click
      handler deselects the current node unless the click landed inside
      `[data-moon],[data-node],…` — and a canvas node carries `data-usernode`,
      which does not match. So a row that opens something must be able to
      stopPropagation, or opening it also disarms the node underneath. The first
      migrated body hit exactly that: the button it replaced stopped the event
      and the row silently could not. */
  onClick?: (e: ReactMouseEvent) => void
  href?: string
  title?: string
  disabled?: boolean
  /** data-* attributes to put on the row element. The board MEASURES rows it can
      identify — a wire anchors to `[data-port]` by its live offsetTop — so a row
      that stands for a token has to keep saying which token it is. Without this
      a migrated body silently loses its wire anchors. */
  data?: Record<string, string>
}

/** a standing fact about the node itself: tinted, with a leading icon */
export function NodeMetaRow({
  label,
  value,
  icon: Glyph = ClockIcon,
  tone = 'default',
  ...rest
}: RowCommon & { label: string; value?: ReactNode; icon?: ((p: { size?: number }) => JSX.Element) | false; tone?: NodeTone }) {
  return (
    <Row className={`nd-row is-meta tone-${tone}`} {...rest}>
      <span className="nd-label">
        {/* `icon={false}` for a fact with no natural glyph — the default clock is
            right for a duration and wrong for everything else, and importing an
            icon just to satisfy a row is how a kit starts costing more than it
            saves. */}
        {Glyph !== false && (
          <span className="nd-rowic" aria-hidden>
            <Glyph size={12} />
          </span>
        )}
        {label}
      </span>
      {value != null && <span className="nd-value">{value}</span>}
    </Row>
  )
}

/** the node's own data: label left, value right */
export function NodeRow({
  label,
  value,
  tone = 'default',
  ...rest
}: RowCommon & { label: ReactNode; value?: ReactNode; tone?: NodeTone }) {
  return (
    <Row className={`nd-row tone-${tone}`} {...rest}>
      <span className="nd-label">{label}</span>
      {value != null && <span className="nd-value">{value}</span>}
    </Row>
  )
}

/**
 * A row whose value is a CONTROL — a select, an input, a swatch picker.
 *
 * It is inert BY CONSTRUCTION: it never becomes a button, and it takes no
 * onClick. That is the whole point. A `<select>` inside a clickable row is
 * invalid interactive nesting and breaks keyboard use, and the way to make that
 * impossible is to give controls a row that cannot be clickable rather than to
 * remember not to pass onClick.
 *
 * The control also sizes itself: `.nd-value` clips at 60% with nowrap, which is
 * right for a number and wrong for a dropdown whose options are token paths.
 */
export function NodeControlRow({
  label,
  children,
  icon: Glyph,
  hint,
  hintId,
  title,
}: {
  label: ReactNode
  /** the control itself — rendered as-is, never wrapped in a button */
  children: ReactNode
  icon?: (p: { size?: number }) => JSX.Element
  /** a line under the control, for the thing it resolves to */
  hint?: ReactNode
  /*
    THE ID THAT LETS A CONTROL POINT AT ITS OWN REASON.

    The row owns the text lines — that is why Select takes an aria-describedby ID
    rather than a message slot, and why an invalid Select cannot be written without
    one. But the hint had no id, so there was nothing to point AT: the pairing existed
    in the layout and not in the accessibility tree. The ControlRow story even claimed
    the connection in a comment — "the select reports it with aria-invalid, and the
    hint says what went wrong in words" — while nothing joined the two, which is how a
    screen reader ended up hearing "invalid entry" and never the words.
  */
  hintId?: string
  title?: string
}) {
  return (
    <div className="nd-row is-control" ref={glassLightRef} title={title}>
      <span className="nd-label">
        {Glyph && (
          <span className="nd-rowic" aria-hidden>
            <Glyph size={12} />
          </span>
        )}
        {label}
      </span>
      <span ref={glassLightRef} className="nd-control">{children}</span>
      {hint != null && (
        <span className="nd-hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}

/** the status of one cell in a matrix row */
export type MatrixCell = { mark: string; tone?: NodeTone; title?: string }

/**
 * A row with N status cells and a trailing action — the shape a label/value row
 * cannot express.
 *
 * The style-group roster is the case that demanded it: a component down each
 * row, a size across, and a join/leave at the end. Its own note says why it
 * cannot collapse to one tick — "a single tick per member could not tell the
 * truth" — because a member can agree at one size and have escaped at another.
 *
 * The header and the rows share one grid template, passed as `cells` count, so
 * the columns line up without either side knowing the other's markup.
 */
export function NodeMatrixRow({
  label,
  cells,
  action,
  tone = 'default',
  title,
}: {
  label: ReactNode
  cells: MatrixCell[]
  /** the trailing action — a Button, or nothing */
  action?: ReactNode
  tone?: NodeTone
  title?: string
}) {
  return (
    <div ref={glassLightRef} className={`nd-row is-matrix tone-${tone}`} style={gridFor(cells.length)} title={title}>
      <span className="nd-label">{label}</span>
      {cells.map((c, i) => (
        <i key={i} className={`nd-cell tone-${c.tone ?? 'default'}`} title={c.title}>
          {c.mark}
        </i>
      ))}
      <span className="nd-matrix-act">{action}</span>
    </div>
  )
}

/** the matrix's column headings — same grid, so the columns align */
export function NodeMatrixHead({ label, columns }: { label?: ReactNode; columns: string[] }) {
  return (
    <div ref={glassLightRef} className="nd-row is-matrix is-matrix-head" style={gridFor(columns.length)}>
      <span className="nd-label">{label}</span>
      {columns.map((c) => (
        <i key={c} className="nd-cell">
          {c}
        </i>
      ))}
      <span className="nd-matrix-act" />
    </div>
  )
}

/** one template, used by the head and every row — the reason they line up */
const gridFor = (n: number) => ({ ['--nd-cells']: String(n) }) as CSSProperties

/**
 * A raw slot inside the kit's frame.
 *
 * The last bodies on this board are not tables of facts — a <pre> of generated
 * code, a live component preview, an uploaded image — and wrapping those in rows
 * makes a card worse, not more consistent. So the kit stops trying: it frames
 * them and gets out of the way.
 *
 * `flush` for content that should touch the card's edges (an image, a preview);
 * the default keeps the inset that prose and code want.
 */
export function NodeContent({ children, flush = false, scroll = false }: { children: ReactNode; flush?: boolean; scroll?: boolean }) {
  return <div className={`nd-content${flush ? ' is-flush' : ''}${scroll ? ' is-scroll' : ''}`}>{children}</div>
}

/**
 * A row of ACTIONS — label on the left, buttons on the right.
 *
 * Inert like the control row and for the same reason: it holds real buttons, so
 * it must never become one itself. This is what a body's toolbar becomes —
 * source's copy/download, a station's run — without inventing a second button
 * treatment beside the kit's.
 */
export function NodeActionRow({ label, children, title }: { label?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div ref={glassLightRef} className="nd-row is-actions" title={title}>
      {label != null && <span className="nd-label">{label}</span>}
      <span className="nd-actions">{children}</span>
    </div>
  )
}

/** a titled run of rows — "Last run" over the parts of the last run */
export function NodeRowGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="nd-group">
      <div className="nd-group-title">{title}</div>
      {children}
    </div>
  )
}

/** an empty state that says what is missing rather than showing nothing */
export const NodeEmpty = ({ children }: { children: ReactNode }) => <div className="nd-empty">{children}</div>

/**
 * The row shell. The ONE place that decides whether a row is interactive, so a
 * clickable row can never ship without its focus ring and a static row can never
 * end up in the tab order.
 */
function Row({ className, onClick, href, title, disabled, data, children }: RowCommon & { className: string; children: ReactNode }) {
  if (href) {
    return (
      <a className={`${className} is-clickable`} ref={glassLightRef} href={href} title={title} {...dataAttrs(data)}>
        {children}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={`${className} is-clickable`} ref={disabled ? undefined : glassLightRef} onClick={(e) => onClick(e)} title={title} disabled={disabled} {...dataAttrs(data)}>
        {children}
      </button>
    )
  }
  return (
    <div className={className} ref={glassLightRef} title={title} {...dataAttrs(data)}>
      {children}
    </div>
  )
}

/** `{ port: 'core:x' }` → `{ 'data-port': 'core:x' }` */
const dataAttrs = (data?: Record<string, string>) =>
  data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v])) : undefined

/*
  PORTS AND WIRES ARE NOT HERE, and that is deliberate.

  This kit briefly carried a `NodePort` (one per row, in/out, green/red branches)
  and a `NodeWire` (a bezier between two points), both modelled on the reference
  board that started this work. The product does neither: it draws wires
  GEOMETRICALLY in one SVG layer, clipping a centre-to-centre line to each card's
  edges, and gives a card exactly ONE out-port — `.nd-outport`, on the card.

  So they were components the board could not use, in a Storybook that claims to
  show the board. scripts/node-kit-test.mjs now asserts every export here is used
  by the product, which is what stops that happening again. The real flow
  vocabulary — seven strokes, one per kind of relationship — is documented in
  Board/Flows from the real classes.
*/
