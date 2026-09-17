/*
  Tooltip — a short hint about the thing under the pointer, and the replacement for `title`.

  WHY IT EXISTS, IN ONE SPEC. WCAG 1.4.13 (Content on Hover or Focus) makes three demands of
  anything that appears on hover, and the native `title` attribute fails all three:

    DISMISSIBLE   Escape must dismiss it without moving focus.  `title` cannot be dismissed.
    HOVERABLE     the pointer must be able to travel ONTO it and it must stay.  `title`
                  vanishes the moment the pointer leaves the trigger.
    PERSISTENT    it stays until dismissed or focus leaves — no timeout.  `title` disappears
                  on its own after a few seconds.

  And beyond the spec: `title` is unstyleable, untranslatable by most tooling, invisible to
  touch entirely, and shown at a delay and position the browser picks. Eight files in this kit
  currently fall back to it, plus one hand-rolled `role="tooltip"` in `TokenTip`. That is the
  named consumer.

  IT REUSES `Popover` FOR THE SURFACE, which is the first proof that the primitive composes.
  Positioning, the top layer, flip-then-shift and the viewport clamp are all inherited; what
  this adds is the TRIGGERING and the ARIA, which is the part a tooltip actually is.

  IT NEVER TAKES FOCUS, and that is what separates it from every other floating thing here. A
  tooltip describes the element you are already on; moving focus into it would take you off
  the thing being described. `Popover` was built to move no focus precisely so this could be
  true without arguing.

  TEXT ONLY, ENFORCED BY THE TYPE. The peer's advice is "don't place interactive elements
  inside a tooltip — use HoverCard or Popover instead", and the reason is 1.4.13's hoverable
  clause: anything you can click, you must be able to reach, and reaching it through a
  disappearing surface is a trap. `text: string` makes the whole class of mistake unwritable
  rather than discouraged.

  THE HINT IS A DESCRIPTION UNLESS THE TRIGGER HAS NO NAME. `aria-describedby` is the default
  because a tooltip normally ADDS to a control that already announces itself. When the trigger
  is icon-only the tooltip IS its name, and then it must be `aria-labelledby` — a described-by
  on a nameless control announces "button" and then the description, which is the wrong way
  round. `names` says which, and it is the one thing the caller genuinely has to decide.
*/
import type { ReactNode } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Popover } from './Popover'
import type { PopoverSide, PopoverAlign } from './Popover'

export type TooltipProps = {
  /*
    THE HINT. A string, not a node — see the header: interactive content in a tooltip is a
    trap under 1.4.13, and the peer says the same. Keep it under about 140 characters; past
    that it is documentation and belongs somewhere a reader can stay.
  */
  text: string
  /** the trigger — any single element or component. It is not cloned; see below */
  children: ReactNode
  /*
    THE TOOLTIP IS THE TRIGGER'S NAME, rather than an addition to it. Set this for icon-only
    controls: `aria-describedby` on a nameless button announces "button" and then the
    description, which is backwards.
  */
  names?: boolean
  /*
    WHICH SIDE, AND WHERE ALONG IT. `top` by default because a hint above a control does not
    cover the next control down, which is what a bottom-placed tooltip does in a dense row —
    and `center`, because a tail in the middle of a short hint reads as pointing rather than
    leaning.
  */
  side?: PopoverSide
  align?: PopoverAlign
  /*
    A SHOW DELAY FOR THE POINTER, AND NONE FOR THE KEYBOARD. Sweeping a pointer across a
    toolbar should not strobe six tooltips, so hovering waits. Focus does not: arriving by
    keyboard is already a deliberate act, and making a keyboard user wait for information a
    mouse user gets by accident is the wrong way round.
  */
  delay?: number
  /** off entirely — for a control whose label is already visible in full */
  disabled?: boolean
}

/*
  THE GRACE PERIOD IS 1.4.13's "hoverable" CLAUSE, and it is why hiding is not immediate. A
  long hint may need to be read, or copied; the pointer has to be able to travel from the
  trigger onto the surface, and the 4px between them is dead space where an instant hide would
  close it mid-journey. Leaving and re-entering within the grace simply cancels the hide.

  300, NOT THE 120 THIS SHIPPED WITH FOR AN HOUR. 120ms is a fast, uninterrupted movement — it
  assumes the pointer crosses the gap without hesitating, and a user who pauses to aim loses
  the hint they were reaching for. This is the known weakness of a plain timeout, and it is why
  Radix reaches for a "safe polygon" instead of a number at all. Until this kit has that, the
  number should be forgiving: 300ms is still under the threshold where a hint feels sticky, and
  it survives a deliberate, hesitant hand.
*/
const GRACE_MS = 300

export function Tooltip({ text, children, names = false, side = 'top', align = 'center', delay = 400, disabled = false }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const showTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  const clear = () => {
    window.clearTimeout(showTimer.current)
    window.clearTimeout(hideTimer.current)
  }
  useEffect(() => clear, [])

  const show = useCallback(
    (immediate: boolean) => {
      if (disabled) return
      clear()
      if (immediate) return setOpen(true)
      showTimer.current = window.setTimeout(() => setOpen(true), delay)
    },
    [delay, disabled]
  )
  const hide = useCallback(() => {
    clear()
    hideTimer.current = window.setTimeout(() => setOpen(false), GRACE_MS)
  }, [])

  /*
    ESCAPE DISMISSES WITHOUT MOVING FOCUS — 1.4.13's "dismissible", and the clause `title`
    most obviously fails. It is captured at the document because the pointer may be nowhere
    near the keyboard focus: a tooltip opened by hover has to be dismissible by a user who
    never touched the trigger with the keyboard at all.
  */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        clear()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  /*
    THE TRIGGER IS WRAPPED, NOT CLONED — and the first version got this wrong in a way that
    made the component nearly useless.

    Cloning looked right: put the aria, the handlers and the anchor ref straight onto the
    element the caller passed, adding no box. But it requires the child to be TRANSPARENT to
    DOM props, and this kit's components deliberately are not — they have curated APIs and do
    not spread `...rest` onto their node. Measured across `Button`, `Chip`, `Tag`, `Avatar` and
    `Badge`: exactly ONE spreads. So a cloned `onPointerEnter` was silently dropped by four out
    of five, and the tooltip worked on Button alone while looking like it worked everywhere.

    The wrapper carries the handlers instead, and it is `display: contents`, so it generates NO
    BOX — nothing in any layout moves. Events from the child bubble up to it, which is all the
    triggering needs.

    THE ARIA STILL HAS TO LAND ON THE CONTROL, because `aria-describedby` on an element that
    generates no box describes nothing. So it is set imperatively on the wrapper's first
    element child — the real trigger — which is also what the Popover anchors to, since a
    `display: contents` element has no rect of its own to measure.
  */
  const wrap = useRef<HTMLSpanElement>(null)
  const anchor = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = wrap.current?.firstElementChild as HTMLElement | null
    anchor.current = el
    if (!el) return
    const attr = names ? 'aria-labelledby' : 'aria-describedby'
    if (open) el.setAttribute(attr, id)
    else el.removeAttribute(attr)
    return () => el.removeAttribute(attr)
  }, [open, names, id, children])

  return (
    <>
      <span
        ref={wrap}
        className="nd-tip-anchor"
        onPointerEnter={() => show(false)}
        onPointerLeave={hide}
        onFocusCapture={() => show(true)}
        onBlurCapture={() => {
          clear()
          setOpen(false)
        }}
      >
        {children}
      </span>
      <Popover
        id={id}
        open={open && !disabled}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        side={side}
        align={align}
        size="small"
        className="nd-tooltip"
      >
        {/*
          `role="tooltip"` GOES HERE, NOT ON THE POPOVER. The surface is a box that knows
          nothing about what it holds — that is the whole contract — so the role belongs to
          the thing that has one.

          AND THE POINTER MAY LAND ON IT. 1.4.13's "hoverable": entering the surface cancels
          the pending hide, so a long hint can be read at leisure.
        */}
        <div
          role="tooltip"
          className="nd-tooltip-body"
          /*
            INVERTED IS A SCHEME, NOT A COLOUR — a hint reads as an overlay ON the interface
            rather than a part of it, and every system says that by flipping polarity. This
            foundation's `inverted` is MODE-RELATIVE: dark on a light theme, light on a dark
            one, with no colour named anywhere. The island is on the BODY because the island
            has to be the thing that paints.
          */
          data-scheme="inverted"
          onPointerEnter={clear}
          onPointerLeave={hide}
        >
          {text}
        </div>
      </Popover>
    </>
  )
}
