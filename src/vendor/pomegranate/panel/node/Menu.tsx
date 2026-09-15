/*
  Menu — the pattern the board app hand-rolled twice, and got wrong in the same three ways
  both times. (The app and both menus are deleted; the census stays because it is why this
  component is shaped the way it is.)

  THE TWO CONSUMERS WERE the app's create-picker dragged out of a node, and its right-click
  context menu. Both were `<div role="menu">` holding plain `<button>`s. Measured against the
  APG Menu pattern, three things were wrong in both:

    THE CHILDREN WERE THE WRONG ROLE. `menu` expects `menuitem` children; a bare `<button>`
    inside one is a button in a menu, which is a different thing to assistive technology.

    THERE WAS NO ROVING TABINDEX. Every item sat in the tab order, so Tab walked THROUGH the
    menu instead of past it — a nine-item menu was nine tab stops where the pattern says one.

    THE HIGHLIGHT WAS A CSS CLASS. An `.on` class moved and nothing else: no focus moved and
    there was no `aria-activedescendant`, so a screen reader was told nothing at all about
    which item the arrow keys just landed on. The context menu had no keyboard handling of
    any kind.

  IT SITS ON `Popover`, which already owns the hard part — the top layer, the flip-then-shift, the
  viewport clamp. The app's `clampMenu` was a hand-rolled half of that, and went with it.

  ONE MENU, TWO ANCHORS, AND THAT IS WHAT MAKES IT COVER BOTH SHAPES. A menu button hangs off
  its trigger; a context menu hangs off a POINT. Popover anchors to an element, so the point case
  renders a zero-size anchor where the pointer was and hands that over — the same box, positioned
  by different means, rather than two components.

  RESEARCHED THROUGH ASTRYX, which splits this three ways — `DropdownMenu`, `ContextMenu`,
  `MoreMenu`. Three components for one pattern with three openings; this kit takes the openings as
  props, the way it took interactivity as a handler everywhere else.
*/
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Popover, type PopoverAlign, type PopoverSide } from './Popover'
import { Divider } from './Divider'
import { ConfirmIcon } from './Icon'

/*
  WHAT AN ITEM MAY HOLD, AND THE LINE IS "CAN YOU CLICK IT". A Badge, a static Tag, an icon, a
  `<kbd>` — all decoration, all fine. A Button, a Chip, a Checkbox — never, and that is measured
  rather than asserted: grafting a real `<button>` into a `menuitem` gives the inner control
  `tabIndex 0` inside a row whose roving index has just said `-1`, and one press fires BOTH. The
  same double-fire ListItem measured before its hit-layer — except a `menuitem` cannot use that
  escape, because the item IS the command.
*/
export type MenuItem = {
  id: string
  label: string
  /** a glyph before the label — decoration, never a second target */
  icon?: ReactNode
  /** a shortcut or a note, at the row's end */
  hint?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /*
    CHECKABLE, WHICH IS THE REAL ANSWER TO "CAN AN ITEM HOLD A CHECKBOX". It cannot contain one —
    see above — so it BECOMES one. Giving `checked` turns the row into `menuitemcheckbox`; giving
    it a `group` as well turns it into `menuitemradio`, which is the pattern's own vocabulary for
    exactly these two jobs.

    THE ROLE IS DERIVED FROM THE DATA rather than declared, so a row cannot claim to be a radio
    and carry no group, or claim to be checkable and have nothing to check.
  */
  checked?: boolean
  /** shared by the members of one radio set — its presence is what makes them radios */
  group?: string
}

/*
  A SEPARATOR IS A LEGAL CHILD OF A MENU, which is why it is an entry rather than something the
  caller draws. `role="menu"` admits `menuitem`, `menuitemcheckbox`, `menuitemradio`, `group` and
  `separator` — and nothing else. It renders the kit's `Divider`, whose `<hr>` already carries
  `role="separator"` implicitly.
*/
export type MenuSeparator = { kind: 'separator'; id: string }

/*
  AND A GROUP IS THE SECTION HEADING THAT IS ACTUALLY IN THE TREE. The `heading` prop is
  `aria-hidden` — a picture above the list — which is right for "create from scheme/fire" and
  wrong for "Sort by". A `group` names a run of items to everyone.
*/
export type MenuGroup = { kind: 'group'; id: string; label: string; items: MenuItem[] }

export type MenuEntry = MenuItem | MenuSeparator | MenuGroup

const isItem = (e: MenuEntry): e is MenuItem => !('kind' in e)

/*
  THE SAME THREE RUNGS THE INLINE LADDER USES — 24 / 32 / 56 of row height, with Button's type at
  each. A menu is a stack of rows and a row is an inline control, so it takes the ladder the rest
  of them take rather than one of its own.
*/
export type MenuSize = 'small' | 'medium' | 'large'

export type MenuProps = {
  open: boolean
  /** fired for Escape, for a press outside, and after a selection — the caller owns the state */
  onClose: () => void
  /*
    THE MENU NEEDS A NAME, and both hand-rolled ones prove why it must be required: the picker
    carries `aria-label="Create a connected node"` and the context menu carries nothing at all, so
    one of the two announces itself as an unnamed menu.
  */
  label: string
  items: MenuEntry[]
  size?: MenuSize
  /*
    ONE OF THESE, NEVER BOTH. A menu button hangs off its trigger; a context menu hangs off the
    point the pointer was at. Popover anchors to an element either way — the point case gets a
    zero-size one of its own.
  */
  anchorRef?: RefObject<HTMLElement | null>
  at?: { x: number; y: number }
  /** a title above the items — the picker's "create from {nodeId}" */
  heading?: ReactNode
  /** a note below them — the picker's keyboard legend */
  footer?: ReactNode
  side?: PopoverSide
  align?: PopoverAlign
  style?: CSSProperties
}

export function Menu({
  open,
  onClose,
  label,
  items,
  anchorRef,
  at,
  heading,
  footer,
  side = 'bottom',
  align = 'start',
  size = 'medium',
  style,
}: MenuProps) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const pointRef = useRef<HTMLSpanElement>(null)
  /*
    WHERE FOCUS RETURNS TO. The APG pattern is explicit that closing a menu puts focus back where
    it came from, and neither hand-rolled menu does: dismiss the picker and focus is on the body,
    so the next Tab starts from the top of the document.
  */
  const returnTo = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(0)

  /*
    FLATTENED FOR THE KEYBOARD, NESTED FOR THE TREE. Groups wrap their items in a `role="group"`,
    which is a structure the arrow keys must not see: Down goes to the next ITEM, whichever group
    it is in. So navigation runs over this flat list while the render walks the nested one, and
    the two stay in step because `rows()` reads the DOM in exactly the order this array is built.
  */
  const flat: MenuItem[] = items.flatMap((e) => (isItem(e) ? [e] : 'items' in e ? e.items : []))
  const enabled = flat.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)

  /* the first item that can actually take focus — a menu that opens onto a disabled row has
     spent its one chance to tell you where you are */
  const firstEnabled = enabled[0] ?? 0

  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null
    setActive(firstEnabled)
    // focus lands on the item, not on the surface: roving tabindex means the ITEM is the tab stop
    const t = window.setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>('[data-menuitem][tabindex="0"]')?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, firstEnabled])

  /*
    THE TRIGGER'S ARIA IS WRITTEN FROM IN HERE, and the story is the argument for it. Before this,
    `aria-haspopup`, `aria-expanded` and `aria-controls` were the CALLER's to write — and the
    specimen in this repo, written by someone who had just read the pattern, got two of the three
    and left `aria-controls` null. A seam that the author of the component fails is not a seam a
    consumer will pass.

    So the component sets them on whatever `anchorRef` points at, which is the arrangement
    `Tooltip` already uses for `aria-describedby`. Three things follow from doing it here:

      `aria-haspopup="menu"` is permanent — the button opens a menu whether or not it is open now
      `aria-expanded` tracks the state, and is `false` rather than absent, which is what a menu
        button says when it is shut
      `aria-controls` finally exists at all, pointing at the surface's own id

    THE POINT CASE HAS NO TRIGGER, so it skips all of this: a right-click menu hangs off a
    coordinate, and there is no element to describe.

    WHAT IS DELIBERATELY NOT DONE HERE is opening on ArrowDown from the trigger. The pattern asks
    for it, and this component CANNOT do it: `open` is the caller's state and there is no
    `onOpen`. Adding one would move the decision about when a menu opens into the menu, which is
    the one thing the two anchors exist to keep out.
  */
  useEffect(() => {
    const el = anchorRef?.current
    if (!el) return
    el.setAttribute('aria-haspopup', 'menu')
    el.setAttribute('aria-expanded', String(open))
    el.setAttribute('aria-controls', id)
    return () => {
      el.removeAttribute('aria-haspopup')
      el.removeAttribute('aria-expanded')
      el.removeAttribute('aria-controls')
    }
  }, [anchorRef, open, id])

  const close = useCallback(() => {
    onClose()
    /* returned on the next frame, after the surface has gone — focusing an element while the
       popover is still in the top layer moves focus and then loses it again */
    window.setTimeout(() => returnTo.current?.focus(), 0)
  }, [onClose])

  /*
    TYPEAHEAD, WHICH THE PATTERN ASKS FOR AND NEITHER HAND-ROLLED MENU HAS. Printable characters
    jump to the next item starting with them, wrapping, and the buffer clears after a pause so
    "c", pause, "c" cycles rather than searching for "cc".
  */
  const typed = useRef({ buffer: '', at: 0 })

  const rows = useCallback(
    () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-menuitem]') ?? [])],
    []
  )

  const move = useCallback(
    (to: number) => {
      setActive(to)
      rows()[to]?.focus()
    },
    [rows]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    /*
      THE CURRENT ROW IS READ FROM THE DOM, NOT FROM STATE, and that is a correctness fix rather
      than a style. `active` is React state, so it is stale inside a handler that runs before the
      next render — two keys in one tick both navigate from the same starting point, and the
      roving tabindex drifts away from where focus actually is. Measured: eight synthesized
      presses left `tabIndex=0` on row 1 while focus sat on row 2, which is the "one tab stop"
      guarantee quietly broken.

      No user types faster than a frame, so this never showed by hand — but the DOM already knows
      which item has focus, and asking the thing that knows removes the second source of truth
      instead of racing it. `active` survives only to render the tabindex.
    */
    const here = rows().indexOf(document.activeElement as HTMLElement)
    const pos = enabled.indexOf(here >= 0 ? here : active)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(enabled[(pos + 1) % enabled.length] ?? firstEnabled)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(enabled[(pos - 1 + enabled.length) % enabled.length] ?? firstEnabled)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(enabled[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      move(enabled[enabled.length - 1])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      /* Tab does not move WITHIN a menu — it leaves it. The pattern is explicit, and letting the
         browser do the moving is what puts focus in the right place afterwards. */
      close()
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now()
      typed.current.buffer = now - typed.current.at > 600 ? e.key : typed.current.buffer + e.key
      typed.current.at = now
      const q = typed.current.buffer.toLowerCase()
      const order = [...enabled.slice(pos + 1), ...enabled.slice(0, pos + 1)]
      const hit = order.find((i) => flat[i].label.toLowerCase().startsWith(q))
      if (hit != null) {
        e.preventDefault()
        move(hit)
      }
    }
  }

  /*
    A CHECKBOX KEEPS THE MENU OPEN; EVERYTHING ELSE CLOSES IT. Toggling "show wires" and having
    the menu vanish means reopening it to toggle the next one, which is the whole reason a
    checkable menu exists. A radio is a CHOICE — it is made once and the menu has done its job —
    so it closes like an ordinary command. Derived from the role, not a third prop.
  */
  const choose = (it: MenuItem) => {
    if (it.disabled) return
    const stayOpen = it.checked != null && !it.group
    if (!stayOpen) close()
    it.onSelect()
  }

  /*
    THE POINT ANCHOR IS A REAL ELEMENT WITH NO SIZE. Popover reads its box to place against, and a
    0×0 box at the pointer is exactly "here" — so a context menu and a menu button take the same
    code path, including the flip and the viewport clamp that `clampMenu` was doing by hand.
  */
  const anchor = anchorRef ?? pointRef

  return (
    <>
      {at && (
        <span
          ref={pointRef}
          aria-hidden
          style={{ position: 'fixed', left: at.x, top: at.y, inlineSize: 0, blockSize: 0 }}
        />
      )}
      <Popover open={open} onClose={close} anchorRef={anchor} side={side} align={align} size="small" id={id}>
        <div
          ref={listRef}
          className={`nd-menu s-${size}`}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={style}
        >
          {heading != null && heading !== false && (
            <div className="nd-menu-heading" aria-hidden>
              {heading}
            </div>
          )}
          {/*
            THE RENDER WALKS THE NESTED LIST while the keyboard runs over the flat one. `at` is a
            counter into the flat array, so a row's index is the same on both sides however many
            groups it is nested in.
          */}
          {(() => {
            let at = -1
            const row = (it: MenuItem) => {
              at += 1
              const i = at
              /*
                THE ROLE IS DERIVED FROM THE DATA. `checked` alone makes a checkbox; `checked` with
                a `group` makes a radio. A row cannot claim to be a radio and carry no group, or
                claim to be checkable with nothing to check, because neither is writable.
              */
              const role =
                it.checked == null ? 'menuitem' : it.group ? 'menuitemradio' : 'menuitemcheckbox'
              return (
                <button
                  key={it.id}
                  type="button"
                  role={role}
                  data-menuitem
                  className="nd-menu-item"
                  /* the row lifts one rung when it takes focus — LevelContext.tsx */
                  data-fill={fieldLevel(useLevel())}
                  tabIndex={i === active ? 0 : -1}
                  disabled={it.disabled}
                  {...(it.checked != null ? { 'aria-checked': it.checked } : {})}
                  onClick={() => choose(it)}
                  onMouseEnter={() => !it.disabled && setActive(i)}
                >
                  {/*
                    THE MARK COLUMN IS RESERVED FOR THE WHOLE MENU, not per row. A tick that only
                    exists on checked rows shifts every label beside it the moment something is
                    ticked; an empty box holds the column open so nothing moves.
                  */}
                  <span className="nd-menu-icon" aria-hidden>
                    {it.checked ? <ConfirmIcon /> : it.icon}
                  </span>
                  <span className="nd-menu-label">{it.label}</span>
                  {it.hint != null && it.hint !== false && <span className="nd-menu-hint">{it.hint}</span>}
                </button>
              )
            }
            return items.map((e) =>
              isItem(e) ? (
                row(e)
              ) : 'items' in e ? (
                /* a real `role="group"`, named — the section heading that IS in the tree, unlike
                   the `heading` prop, which is a picture above the list */
                <div key={e.id} role="group" aria-label={e.label} className="nd-menu-group">
                  <div className="nd-menu-grouplabel" aria-hidden>
                    {e.label}
                  </div>
                  {e.items.map(row)}
                </div>
              ) : (
                /* `Divider`'s `<hr>` already carries `role="separator"` implicitly, which is one of
                   the five children `role="menu"` admits — so this is reuse rather than a drawing */
                <Divider key={e.id} style={{ marginBlock: 'var(--spacing-component-0)' }} />
              )
            )
          })()}
          {footer != null && footer !== false && (
            <div className="nd-menu-footer" aria-hidden>
              {footer}
            </div>
          )}
        </div>
      </Popover>
    </>
  )
}
