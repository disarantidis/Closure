/*
  Popover — a surface that floats above everything, anchored to something.

  THE PROBLEM IT EXISTS FOR, stated by the components before it was built. Every floating
  surface in this kit was `position: absolute` inside its own trigger — `Combobox`'s list at
  `z-index: 2`, `DateTimeField`'s flyout, the deleted board app's two menus — and `Swatch`'s
  header already wrote down why that is fragile: "it is drawn outside the page, so the card's
  `overflow: hidden` cannot clip it and the canvas transform cannot displace it." A board node
  is a card with `overflow: hidden` sitting inside a transformed canvas. Both of those things
  eat an in-flow popup.

  THE PLATFORM SOLVES IT, SO WE TAKE THE PLATFORM'S. The `popover` attribute puts an element
  in the browser's TOP LAYER — outside the normal flow entirely, so no ancestor's `overflow`,
  `z-index`, `clip-path` or `transform` can reach it. Measured before this was written: a div
  inside an ancestor with BOTH `overflow: hidden` AND `transform: translate(40px,40px)
  scale(0.5)` rendered unclipped at exactly the coordinates it asked for. That is the whole
  reason this file is fifty lines rather than a portal, a z-index register and a stacking
  context audit.

  `manual`, NOT `auto`, AND THAT IS THE ONE PLACE THE PLATFORM IS DECLINED. `popover="auto"`
  adds light-dismiss and Escape for free, which is genuinely tempting — but it dismisses on
  pointerDOWN anywhere outside, including on the trigger, and a trigger's own click then sees
  a closed popover and reopens it. The result is a control that cannot be closed by pressing
  the thing that opened it. That is a real defect, and it comes from an uncontrolled dismissal
  racing a controlled `open` prop. So dismissal is ours, deterministic, and the trigger is
  excluded from it by name.

  THE SEMANTICS BELONG TO THE CALLER, which is why this component sets no `role`. A popover is
  a BOX; what is inside it may be a `listbox`, a `menu`, a `dialog` or a tooltip, and each of
  those has different requirements for focus, for arrow keys and for what the trigger must
  announce. A box that guessed would be wrong three times out of four. The trigger's
  `aria-expanded` / `aria-haspopup` / `aria-controls` are the caller's too — `Chip`'s
  disclosure mode already emits all three.

  IT DOES NOT MOVE FOCUS, for the same reason. A menu wants focus; a combobox listbox
  explicitly does not (the input keeps it and drives the list with `aria-activedescendant`);
  a tooltip must never take it. The caller decides.
*/
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/*
  WHERE IT WANTS TO SIT — a SIDE and an ALIGNMENT, on two axes rather than twelve hyphenated
  strings. Four sides × three alignments is twelve combinations, and spelling each one out as
  a union member is how a component ends up with `'bottom-start'` and no way to say "the same
  alignment, the other side" without string surgery. The peer models it the same way.

  IT IS A PREFERENCE RATHER THAN A PROMISE: the surface flips to the opposite side when the
  preferred one has no room, which is what stops a menu near the window's edge opening
  off-screen.

  `start` AND `end` ARE LOGICAL, `top` AND `bottom` ARE NOT — and that asymmetry is the
  document's, not ours. The inline axis mirrors in a right-to-left document and the block axis
  does not, so naming the horizontal sides `left`/`right` would be a promise the component
  breaks the moment someone sets `dir="rtl"`. The Avatar's badge anchors already learned this
  the hard way.
*/
export type PopoverSide = 'top' | 'bottom' | 'start' | 'end'
/** where along that side it lines up with the anchor */
export type PopoverAlign = 'start' | 'center' | 'end'

/*
  THE SURFACE'S SCALE, AND THE CORNER IS HOW IT SHOWS. A popover opened from a small chip and
  one opened from a whole panel are not the same object, and the difference the eye actually
  reads is the CORNER: a big surface with a tight corner looks cut out of card stock, a small
  one with a generous corner looks inflated.

  IT IS DECLARED, NOT DERIVED, and that is a departure worth defending — this kit derives
  wherever it can. But the trigger's pixel height does not logically determine the surface's
  scale: a 24px icon button legitimately opens a full settings panel, and a rule that measured
  the anchor would give that panel a chip's corner. What the caller means is "how big is this
  surface", and only the caller knows.

  THE THREE RUNGS SETTLE AN ARGUMENT THE KIT WAS ALREADY HAVING. Its floating surfaces each
  picked a corner alone — `.nd-menu` at `small`, `.nd-combobox-list` and `.nd-nodecard` at
  `medium` — so a menu and a dropdown opened from the same row did not agree. 8 / 12 / 16 is
  one progression, and `medium` is the default because it is what the two most representative
  surfaces already chose.
*/
export type PopoverSize = 'small' | 'medium' | 'large'

export type PopoverProps = {
  open: boolean
  /** fired for Escape and for a press outside — the caller owns the state */
  onClose: () => void
  /** what it hangs off. The trigger keeps its own aria; this only reads its box */
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  /** which side of the anchor it opens on — a preference; it flips when there is no room */
  side?: PopoverSide
  /** where along that side it lines up */
  align?: PopoverAlign
  /** how big this surface is — small for a chip's menu, large for a panel. Sets the corner */
  size?: PopoverSize
  /*
    MATCH THE ANCHOR'S WIDTH — what a listbox wants and a menu does not. A select's options
    reading narrower than the field they belong to looks like a different control; a context
    menu stretched to its trigger's width looks like a mistake.
  */
  matchAnchorWidth?: boolean
  /** so the trigger can point `aria-controls` at it */
  id?: string
  className?: string
  style?: CSSProperties
}

/*
  THE TWO DISTANCES ARE TOKENS, READ OFF THE ELEMENT. They could have been `const GAP = 4`
  and `const EDGE = 8` — those are the right numbers today — and that is exactly the literal
  the kit refuses everywhere else. They are declared in node.css as custom properties and
  read from the live element instead, so moving the spacing scale moves them too.

  Read ONCE per opening rather than per placement: `place()` runs on every scroll frame, and
  `getComputedStyle` there would be the cheapest possible way to make scrolling expensive.
*/
const readOffsets = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  const num = (n: string, fallback: number) => parseFloat(cs.getPropertyValue(n)) || fallback
  return { gap: num('--nd-popover-gap', 4), edge: num('--nd-popover-edge', 8) }
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  side = 'bottom',
  align = 'start',
  size = 'medium',
  matchAnchorWidth = false,
  id,
  className,
  style,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const offsets = useRef({ gap: 4, edge: 8 })

  /*
    POSITIONED IN SCRIPT, BECAUSE THE TOP LAYER HAS NO PARENT TO POSITION AGAINST. An element
    in the top layer is laid out against the VIEWPORT, so `position: fixed` plus a measured
    anchor rect is the honest way to place it. CSS anchor positioning would say this
    declaratively and is not portable enough yet.

    FLIP, THEN SHIFT — in that order, because they answer different questions. Flip changes
    which SIDE the surface is on when the preferred side has no room; shift slides it along
    the other axis so it stays inside the viewport. Doing shift first would let a surface
    slide sideways to avoid an overflow that flipping would have removed entirely.
  */
  const place = useCallback(() => {
    const el = ref.current
    const anchor = anchorRef.current
    if (!el || !anchor) return

    const { gap: GAP, edge: EDGE } = offsets.current
    const a = anchor.getBoundingClientRect()
    if (matchAnchorWidth) el.style.minInlineSize = `${a.width}px`
    /* clear last frame's cap before measuring, or the surface remembers a smaller room and
       never grows back when it flips to the side that has more */
    el.style.maxBlockSize = ''
    const box = el.getBoundingClientRect()

    /*
      THE LOGICAL SIDE RESOLVES AGAINST THE DOCUMENT, not against a guess. `start` is the left
      in a left-to-right document and the right in a right-to-left one, and reading it off the
      element is what makes that true without a second vocabulary.
    */
    const rtl = getComputedStyle(el).direction === 'rtl'
    const physical: 'top' | 'bottom' | 'left' | 'right' =
      side === 'start' ? (rtl ? 'right' : 'left') : side === 'end' ? (rtl ? 'left' : 'right') : side

    const vertical = physical === 'top' || physical === 'bottom'
    const room = {
      top: a.top - GAP - EDGE,
      bottom: window.innerHeight - a.bottom - GAP - EDGE,
      left: a.left - GAP - EDGE,
      right: window.innerWidth - a.right - GAP - EDGE,
    }
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const

    /*
      FLIP, THEN SHIFT — in that order, because they answer different questions. Flip changes
      which SIDE the surface is on when the preferred one cannot hold it; shift slides it along
      the other axis so it stays inside the viewport. Shifting first would let a surface slide
      sideways to dodge an overflow that flipping removes outright.
    */
    const need = vertical ? box.height : box.width
    const flipped = room[physical] < need && room[opposite[physical]] > room[physical]
    const on = flipped ? opposite[physical] : physical
    const onVertical = on === 'top' || on === 'bottom'

    /* the main axis is the one the surface is aligned ALONG; the cross axis is the one the
       side is chosen on */
    const anchorMain = onVertical ? { start: a.left, end: a.right, size: a.width } : { start: a.top, end: a.bottom, size: a.height }
    const boxMain = onVertical ? box.width : box.height
    const viewMain = onVertical ? window.innerWidth : window.innerHeight

    let main =
      align === 'end' ? anchorMain.end - boxMain : align === 'center' ? anchorMain.start + (anchorMain.size - boxMain) / 2 : anchorMain.start
    main = Math.min(main, viewMain - boxMain - EDGE)
    main = Math.max(main, EDGE)

    const cross =
      on === 'top' ? a.top - box.height - GAP
      : on === 'bottom' ? a.bottom + GAP
      : on === 'left' ? a.left - box.width - GAP
      : a.right + GAP

    /*
      THE ROOM IS THE SURFACE'S ONLY LIMIT, and only this function knows it — it depends on
      which side the flip chose. Content caps itself (a scrolling list decides how tall a list
      may be); the surface simply may not leave the viewport.
    */
    el.style.maxBlockSize = `${Math.max(0, Math.round(room[on]))}px`

    el.style.top = `${Math.round(onVertical ? cross : main)}px`
    el.style.left = `${Math.round(onVertical ? main : cross)}px`

    /*
      THE ARROW POINTS AT THE ANCHOR'S CENTRE, which is the only position that is always right.
      Deriving it from the ALIGNMENT instead would put the tail at the surface's corner
      whenever the surface was shifted back from a viewport edge — pointing confidently at
      nothing. So it is measured: the anchor's midpoint along the main axis, expressed relative
      to the surface's own start, and clamped so the tail never rides out over a rounded corner.

      `--nd-popover-arrow` is that offset and `data-side` is the edge it belongs on. Both are
      written here because only this function knows where the surface actually landed; the
      stylesheet draws from them and computes nothing.
    */
    const centre = anchorMain.start + anchorMain.size / 2 - main
    const inset = 14
    el.style.setProperty('--nd-popover-arrow', `${Math.round(Math.min(Math.max(centre, inset), boxMain - inset))}px`)
    el.dataset.side = on
  }, [anchorRef, matchAnchorWidth, side, align])

  /*
    SHOW AND HIDE ARE IMPERATIVE, because the top layer is. `showPopover()` throws if the
    element is already showing, so both calls are guarded by the live `:popover-open` state
    rather than by what React last rendered — the two can disagree for one frame after a
    dismissal, and an exception there would take the panel down with it.
  */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const isOpen = el.matches(':popover-open')
    if (open && !isOpen) {
      offsets.current = readOffsets(el)
      el.showPopover()
      place()
    } else if (!open && isOpen) {
      el.hidePopover()
    }
  }, [open, place])

  /* re-place while it is open: the anchor moves when the page scrolls or the window resizes,
     and a surface that stayed put would drift off its trigger. `capture` because the scroll
     may happen in any ancestor, not on the window. */
  useEffect(() => {
    if (!open) return
    place()
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, place])

  /*
    DISMISSAL, OURS AND DETERMINISTIC. Escape closes; a press outside closes — but a press on
    the TRIGGER does not, because the trigger's own handler is about to toggle and two
    closures in one gesture is the "cannot be closed by clicking the thing that opened it"
    defect this component was written to avoid.
  */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, onClose, anchorRef])

  return (
    <div
      ref={ref}
      id={id}
      /*
        MANUAL — see the header. `auto` would light-dismiss on the trigger and fight a
        controlled `open`; the top layer is what we are here for, and `manual` still gives it.

        SPREAD RATHER THAN WRITTEN, because `popover` is not in this React version's DOM
        typings yet. The attribute is the entire mechanism, so it is set explicitly instead of
        waiting for `@types/react` — and the cast is narrowed to this one attribute so it
        cannot quietly admit anything else.
      */
      {...({ popover: 'manual' } as { popover: string })}
      className={['nd-popover', `s-${size}`, className].filter(Boolean).join(' ')}
      /* a floating panel is a REGION with its own ground: it is a level island at the top
         rung, so what it holds measures itself against the panel rather than the page it
         happens to float over (tokens.css, THE FILL AXIS) */
      data-level={4}
      /* OPAQUE BY DESIGN, and it says so on the axis that decides materials. This surface
         painted the solid `--surface` before the fills collapsed into one name; now
         `--background` is glass at three rungs of four, and a panel that frosts nothing must
         declare the material rather than rely on which rung it happens to land on. */
      data-surface="normal"
      style={style}
    >
      {children}
    </div>
  )
}
