/*
  ChipGroup — the collection, which is the half of this pattern nobody notices is missing.

  A ROW OF CHIPS IS NOT A ROW OF CHIPS. It is a set, and a set owns four things no member can
  own for itself:

    a NAME              "Filters", "Applied to", "Topics" — a screen reader meets the set
                        before it meets any member, and an unnamed set is a pile.
    the SELECTION KIND  many-of-N is checkboxes, one-of-N is radios sharing a name. That is a
                        property of the SET (see ChipGroupContext), and it is what buys
                        exactly-one-enforced and one tab stop for the single case.
    the OVERFLOW        the board app's ValueSheet (gone with it) did `visibleIn.slice(0, 4)`
                        and the fifth tag simply vanished — no "+N more", no way to reach it.
                        That defect is what this component was built against, and it is the
                        default shape of any over-full chip row.
    the FOCUS after a   `Tag`'s header has always said "a caller that removes a tag owns the
    REMOVAL             focus that follows it (Polaris' rule — move focus on, do not let it
                        fall to the document)". Until now no caller did, because there was
                        nowhere for that code to live. It lives here.

  THE OVERFLOW IS A DISCLOSURE, AND IT EXPANDS IN PLACE. A flyout is now possible — `Popover`
  landed and `FilterChip` uses it — but the row's overflow is kept an in-place expand on purpose:
  the hidden members are live controls (a DismissChip you remove, a ToggleChip you flip), not a
  list of values to pick, so revealing them where they belong beats hiding them behind a second
  press. `aria-expanded` on the toggle and `aria-controls` pointing at this group's own list make
  it a real disclosure that needs no portal and hides nothing from the keyboard.

  THE TOGGLE IS THIS COMPONENT'S OWN CHIP-BUTTON, not a kit chip. The chip family is three modes
  now — DismissChip, ToggleChip, FilterChip — and "reveal my own overflow" is none of them, so the
  group draws the `.nd-chip` pill itself rather than reaching for a mode that does not fit.

  IT DOES NOT OWN THE ITEMS. Callers pass chip-family children and keep their own data; this adds
  a set around them. A group that took an array of options would have to re-invent every chip's
  props as fields, which is how a small component becomes a configuration language.
*/
import type { CSSProperties, ReactNode } from 'react'
import { Children, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChipGroupContext } from './ChipGroupContext'
import type { ButtonSize } from './Button'
import { fieldLevel, useLevel } from './LevelContext'

export type ChipGroupProps = {
  /** the set's accessible name — REQUIRED and never rendered. A caller that shows a caption
      beside the row still needs a name of its own, because the caption is not
      programmatically tied to the group (DropDownSelect's argument, verbatim). */
  label: string
  children: ReactNode
  /*
    THE SELECTION KIND BELONGS TO THE SET. `multiple` renders its members as checkboxes;
    `single` renders them as radios sharing a name, which is what buys exactly-one-selected
    and ONE tab stop with arrow keys — the platform's, not ours.

    Absent means the group is not about selection at all: a row of removable tokens, or of
    trips. That is the common case and it costs nothing.

    WHEN TO PREFER `SegmentedControl` FOR SINGLE: that one is a joined track for 2–5 options
    that are always all visible. A single-select chip group is the wrapping, separated,
    possibly-overflowing version of the same choice. Both are radios underneath — which is
    why they behave identically to a keyboard and only look different.
  */
  select?: 'single' | 'multiple'
  /** the rung every member stands on */
  size?: ButtonSize
  /** show this many, then a disclosure chip for the rest. Absent means show everything */
  max?: number
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export function ChipGroup({ label, children, select, size = 'small', max, style }: ChipGroupProps) {
  const name = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  /* the index focus was standing on when a removal started — read while the element still
     exists, spent after it is gone */
  const pending = useRef<number | null>(null)

  const single = select === 'single'

  /*
    NOTED BEFORE THE UNMOUNT, RESTORED AFTER IT. By the time React has re-rendered without the
    removed chip, `document.activeElement` is `<body>` and the index is unrecoverable — so the
    member calls this on its way into its own handler, while it is still in the DOM.
  */
  const willDismiss = useCallback(() => {
    const el = ref.current
    if (!el) return
    const chips = [...el.querySelectorAll('[data-chip]')]
    const i = chips.indexOf(document.activeElement as Element)
    pending.current = i >= 0 ? i : null
  }, [])

  const items = useMemo(() => Children.toArray(children), [children])
  const overflowing = max != null && items.length > max
  const shown = overflowing && !open ? items.slice(0, max) : items
  const hidden = items.length - shown.length

  /*
    FOCUS LANDS ON THE NEXT CHIP, or the last one if the removed chip was last, or the group
    itself if the set is now empty. Never on the document — which is where it goes by default,
    and which silently returns a keyboard user to the top of the page.
  */
  useLayoutEffect(() => {
    const i = pending.current
    if (i == null) return
    pending.current = null
    const el = ref.current
    if (!el) return
    const chips = [...el.querySelectorAll<HTMLElement>('[data-chip]')].filter(
      (c) => !c.hasAttribute('disabled') && !c.querySelector('input:disabled')
    )
    if (!chips.length) return el.focus()
    chips[Math.min(i, chips.length - 1)].focus()
  }, [items.length])

  const ctx = useMemo(
    () => ({ name: single ? name : undefined, single, size, willDismiss }),
    [single, name, size, willDismiss]
  )

  return (
    <ChipGroupContext.Provider value={ctx}>
      <div
        ref={ref}
        /* radios are a radiogroup; everything else is a plain group. Both are named, which is
           the part that was missing entirely */
        role={single ? 'radiogroup' : 'group'}
        aria-label={label}
        /* focusable ONLY as the last resort of the removal rule above — never in the tab
           order, so it costs the keyboard nothing */
        tabIndex={-1}
        id={listId}
        className={['nd-chipgroup', `s-${size}`].join(' ')}
        style={style}
      >
        {shown}
        {overflowing && (
          <button
            type="button"
            className={`nd-chip v-container s-${size}`}
            /* one rung off its ground, as every other container chip in the kit is — the
               group draws this pill itself, so it has to write the attribute Chip writes.
               Without it `--nd-field-fill` is undeclared and the pill has no fill at all. */
            data-fill={fieldLevel(useLevel())}
            data-chip
            aria-expanded={open}
            aria-controls={listId}
            aria-label={open ? `Show fewer ${label}` : `Show ${hidden} more ${label}`}
            onClick={() => setOpen((o) => !o)}
            /* a press inside a control must never start a node drag */
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="nd-chip-label">{open ? 'show fewer' : `+${hidden} more`}</span>
          </button>
        )}
      </div>
    </ChipGroupContext.Provider>
  )
}
