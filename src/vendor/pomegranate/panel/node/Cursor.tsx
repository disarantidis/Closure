/*
  Cursor — a bold custom pointer the kit draws in place of the OS arrow, over a
  surface it owns.

  WHY THE KIT DRAWS ITS OWN. The OS cursor is one hairline glyph the platform tints
  for us and we cannot restyle — it is black on macOS, white-outlined on Windows, and
  a different weight on every screen. A product that wants its pointer to read as part
  of the same family as its buttons and its focus ring has to draw the pointer itself,
  hide the native one under it (`cursor: none` on the region), and move the drawn one
  with the mouse. That is all this component is: a region that captures pointer
  movement and a glyph that follows the hotspot.

  THE COLOUR PAIR IS THE WHOLE TRICK. A cursor floats over arbitrary content — a card,
  a chart, an image — so it can lean on no single ground for contrast. It carries its
  own instead: the body is `--accent` (bold, saturated, and the same token the Spinner
  and a primary Button spend, so it repaints with the scheme it lands in) and the rim
  is `--text-on-accent`, the role that is contrast-matched TO accent by construction
  (COLOR-TOKEN-RULES row a8). Body-against-rim is therefore legible by the same
  guarantee that makes label-on-a-primary-button legible, and high chroma against the
  kit's neutral surfaces does the rest. Nothing here names a literal colour, and a
  cursor inside `data-scheme="error"` turns red the way every other accent-bearing
  thing in that scheme does.

  IT REACTS ON PRESS. Body and rim swap to their `-pressed` siblings and the glyph
  scales down a touch — the same physical "pushed in" the container controls give — so a
  click has a pointer-level acknowledgement, not just a target-level one. Movement
  (translate) and the press (scale) live on two different elements so they never fight
  for the one `transform`.

  IT IS PRESENTATIONAL AND DECORATIVE. The region is a passthrough for its children's
  own interactions; the glyph is `aria-hidden` and `pointer-events: none`, so it never
  eats a click and never announces itself. A pointer is not content.
*/
import { useEffect, useRef, useState } from 'react'

export type CursorShape = 'arrow' | 'dot' | 'ring' | 'hand' | 'grab'

/*
  Each shape is one <svg>, sized by `--nd-cursor-size`, with its hotspot — the single
  pixel that IS the pointer — parked at the layer's origin by CSS (see node.css). The
  arrow's hotspot is its tip, drawn at the viewBox origin; the disc and the ring point
  from their centre, which CSS pulls back by half the size. The rim is a real stroke,
  not a shadow, so it holds its weight at any size and in reduced-transparency mode.
*/
function Glyph({ shape }: { shape: CursorShape }) {
  if (shape === 'dot') {
    return (
      <svg className="nd-cursor-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
      </svg>
    )
  }
  if (shape === 'ring') {
    return (
      <svg className="nd-cursor-glyph is-hollow" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" />
      </svg>
    )
  }
  if (shape === 'hand') {
    /*
      A cartoon pointing glove — index finger up, thumb out, three curled fingers, a
      round cuff. IT IS AN ORIGINAL DRAWING in the generic playful-pointer idiom, NOT a
      copy of any character's artwork: the pointing-hand cursor is a convention every
      platform ships. The silhouette carries the fill and the outer rim; the crease
      lines are stroke-only, drawn on top, so the fingers separate without seams. The
      hotspot is the fingertip, parked at the layer origin by CSS. `is-glove` carries the
      cartoon colour pairing it shares with `grab` — a light body, a dark outline.
    */
    return (
      <svg className="nd-cursor-glyph is-glove is-hand" viewBox="0 0 64 64" aria-hidden="true">
        <path
          className="nd-cursor-silhouette"
          d="M20 9 C20 4.6 31 4.6 31 9 L31 27
             C36 24 40 24.5 43 26 C45 22.5 51 23.5 51 28 L51 30
             C55 30 57 33 56.5 37 L55 50 C54 57 49 61 41 61
             L25 61 C18 61 13.5 57 12.5 50 L10.5 41
             C6 40 3.5 35.5 5.5 31.5 C7 28.5 11 28.5 13.5 30.5
             L20 32 Z"
        />
        <g className="nd-cursor-crease" fill="none">
          <path d="M31 30 C36 27 41 27.5 43 30" />
          <path d="M43 30 C47 28.5 51 29 51.5 32" />
          <path d="M20 32 C15 30 12 30.5 11 33" />
        </g>
      </svg>
    )
  }
  if (shape === 'grab') {
    /*
      The same cartoon glove, CLOSED — a fist for a surface you drag. It shares the
      hand's `is-glove` colouring and its seam-free construction (one silhouette group,
      creases stroked on top), and it points from its centre the way a grab handle does.
      Body plus a thumb wrapped across the front; the knuckle creases and the cuff are
      the only interior lines.
    */
    return (
      <svg className="nd-cursor-glyph is-glove is-grab" viewBox="0 0 64 64" aria-hidden="true">
        <g className="nd-cursor-silhouette">
          <path d="M13 30 Q13 15 28 15 L37 15 Q52 15 52 30 L51 50 Q51 60 41 60 L24 60 Q13 60 13 50 Z" />
          <path d="M14 45 Q5 43 5 34 Q5 26 14 27 Q21 28 22 36 Q22 45 14 45 Z" />
        </g>
        <g className="nd-cursor-crease" fill="none">
          <path d="M24 16 Q24 21 23 26" />
          <path d="M31 15 Q31 21 31 26" />
          <path d="M38 16 Q38 21 39 26" />
          <path d="M16 52 Q33 56 49 52" />
        </g>
      </svg>
    )
  }
  // arrow — tip at (0,0), a chunky body with round joins so it reads bold, not spindly
  return (
    <svg className="nd-cursor-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M0 0 L0 18 L4.8 13.6 L8.1 21 L11.2 19.7 L7.9 12.6 L14 12.6 Z" />
    </svg>
  )
}

/*
  THE COMPONENT HAS TWO VARIANTS, and they are a discriminated union rather than one
  bag of optional props, because the two share only the region — a glyph has a shape
  and a press; a blob has neither, but has an invert and a lag a glyph does not. Making
  `shape` a prop of the blob, or `variant` a free string, would let a call name a shape
  for a blob and typecheck — the dead-half the kit refuses (see Swatch, COMPOSITION-RULES).
  The union makes those states unwritable: `variant="blob"` has no `shape` to set.
*/
type GlyphCursorProps = {
  variant?: 'glyph'
  /** 'arrow' and 'hand' point from their tip; 'dot', 'ring' and 'grab' from their centre. */
  shape?: CursorShape
  /** Rendered box in px — the geometry scales with it. */
  size?: number
  /** The surface the custom pointer owns. Its own interactions pass straight through. */
  children: React.ReactNode
}
type BlobCursorProps = {
  /** The inverting blob — a soft disc that flips what it passes and swells over targets. */
  variant: 'blob'
  /** Resting diameter in px. */
  size?: number
  /** How many times its resting size the disc swells to over an interactive target. `1` disables the swell. */
  grow?: number
  /** How tightly the disc tracks the pointer, 0–1: lower drifts more, `1` snaps. Reduced motion forces `1`. */
  follow?: number
  children: React.ReactNode
}

export function Cursor(props: GlyphCursorProps | BlobCursorProps) {
  return props.variant === 'blob' ? <BlobCursor {...props} /> : <GlyphCursor {...props} />
}

function GlyphCursor({ shape = 'arrow', size = 28, children }: GlyphCursorProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [pressed, setPressed] = useState(false)
  const region = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={region}
      className="nd-cursor-region"
      // the tracked point is relative to the region's own box, so the glyph lands under
      // the mouse no matter where the region sits or how the page is scrolled
      onPointerMove={(e) => {
        const r = region.current?.getBoundingClientRect()
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onPointerLeave={() => {
        setPos(null)
        setPressed(false)
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
    >
      {children}
      {pos && (
        <div
          className={`nd-cursor-point shape-${shape}${pressed ? ' is-pressed' : ''}`}
          style={{
            ['--nd-cursor-size' as string]: `${size}px`,
            transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
          }}
        >
          <Glyph shape={shape} />
        </div>
      )}
    </div>
  )
}

/* which descendants make the blob swell — the same interactive vocabulary a row uses */
const BLOB_INTERACTIVE =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])'

/*
  THE BLOB is a difference-blend lens, not a drawn glyph, so it is built differently on
  three counts. It LAGS: the disc eases toward the pointer on a rAF loop instead of
  snapping, so it drifts like a physical thing (position is a ref, not state — sixty
  setStates a second is the bug this avoids). It INVERTS: a white disc on
  `mix-blend-mode: difference` flips whatever it sits over, which is why the region
  `isolate`s — the invert must stop at the surface the cursor owns, not bleed onto the
  page. And it GROWS: over any interactive descendant it doubles, so the whole region
  reads as one live surface. Reduced motion drops the ease (the disc snaps) but keeps
  the invert — the manipulation is direct, only the drift is the animation.
*/
function BlobCursor({ size = 44, grow = 2, follow = 0.18, children }: BlobCursorProps) {
  const region = useRef<HTMLDivElement>(null)
  const blob = useRef<HTMLDivElement>(null)
  const target = useRef({ x: 0, y: 0, grow: 1 })
  const posRef = useRef({ x: 0, y: 0, grow: 1 })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!visible) return
    const k = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : follow
    let id = 0
    const tick = () => {
      const p = posRef.current
      const t = target.current
      p.x += (t.x - p.x) * k
      p.y += (t.y - p.y) * k
      p.grow += (t.grow - p.grow) * k
      if (blob.current) {
        blob.current.style.transform = `translate3d(${p.x - size / 2}px, ${p.y - size / 2}px, 0) scale(${p.grow})`
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [visible, size, follow])

  return (
    <div
      ref={region}
      className="nd-cursor-region is-blob"
      onPointerMove={(e) => {
        const r = region.current?.getBoundingClientRect()
        if (!r) return
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        const scale = (e.target as Element)?.closest?.(BLOB_INTERACTIVE) ? grow : 1
        target.current = { x, y, grow: scale }
        // on entry, seat the disc under the pointer (at the right size) so it neither
        // flies in from the corner nor pops from the wrong scale
        if (!visible) {
          posRef.current = { x, y, grow: scale }
          setVisible(true)
        }
      }}
      onPointerLeave={() => setVisible(false)}
    >
      {children}
      <div
        ref={blob}
        className={`nd-cursor-blob${visible ? ' is-visible' : ''}`}
        style={{ ['--nd-cursor-size' as string]: `${size}px` }}
        aria-hidden="true"
      />
    </div>
  )
}
