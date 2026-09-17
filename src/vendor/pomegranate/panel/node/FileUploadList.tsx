/*
  FileUploadList — the set, which owns the three things no single row can.

  A list of files looks like something a caller can write with `.map()`, and for the drawing
  it is. What it cannot write with `.map()` is any of this:

  ONE — THE NAME. A group of rows is a region, and a region with no name is a pile. The
  members name themselves (each row is its file); nothing among them can name the set, so the
  set states it, exactly as ChipGroup and Menu do.

  TWO — THE COUNT, ANNOUNCED ONCE. Files arriving and leaving is the whole event here, and to
  a screen reader it is otherwise silent: rows appear with no focus change and nothing to
  read. ACCESS-RULES is strict about the shape of the fix — a live region announces the COUNT
  and ONLY the count, because a region that reads each row's state on every progress tick
  buries the person under the thing they were told to watch. So this says "3 files", and the
  rows say the rest whenever a reader goes to them.

  THREE — FOCUS AFTER A REMOVAL, which is the one a caller cannot fix later. Press ✕ on the
  third of five rows and that button unmounts under the keyboard: focus falls to `<body>`,
  and the next Tab starts again from the top of the document. By the time React has
  re-rendered, the index is unrecoverable — `document.activeElement` is already gone. So the
  member reports on its way IN to its own handler, through the context, and the set spends
  the index after the unmount. This is ChipGroup's mechanism, deliberately unchanged: the
  same problem, the same shape, and a second solution to one problem is how two sets learn to
  behave differently.

  IT TAKES CHILDREN, NOT AN `items` ARRAY. An array prop would have to re-declare every
  member's fields — name, size, progress, error, remover — and a set that describes its
  members is a configuration language rather than a component. COMPOSITION-RULES states it
  plainly: a group takes children.
*/
import type { CSSProperties, ReactNode } from 'react'
import { Children, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { FileUploadListContext } from './FileUploadListContext'

export type FileUploadListProps = {
  /*
    THE SET'S ACCESSIBLE NAME — required, and never drawn. The heading a caller has above
    the list is not programmatically tied to it (DropDownSelect's argument, which every set
    in this kit has since inherited), so the group carries its own.
  */
  label: string
  children: ReactNode
  /** placement only — margin and grid position belong to the layout that holds the list */
  style?: CSSProperties
}

export function FileUploadList({ label, children, style }: FileUploadListProps) {
  const ref = useRef<HTMLDivElement>(null)
  /* the index focus was standing on when a removal started — read while the row still
     exists, spent after it is gone */
  const pending = useRef<number | null>(null)

  const willRemove = useCallback(() => {
    const el = ref.current
    if (!el) return
    const removers = [...el.querySelectorAll('.nd-item-trailing button')]
    const i = removers.indexOf(document.activeElement as Element)
    /*
      A POINTER REMOVAL LEAVES `pending` NULL AND THAT IS CORRECT. The mouse did not come
      from anywhere in the tab order and has nowhere to be put back; moving focus after a
      click is how a list steals it from whatever the person was actually doing. Only a
      removal that STARTED at a focused button restores one.
    */
    pending.current = i >= 0 ? i : null
  }, [])

  const items = useMemo(() => Children.toArray(children), [children])

  /*
    FOCUS LANDS ON THE NEXT ROW'S ✕, or the last one if the removed row was last, or the list
    itself if nothing is left. Never on the document.
  */
  useLayoutEffect(() => {
    const i = pending.current
    if (i == null) return
    pending.current = null
    const el = ref.current
    if (!el) return
    const removers = [...el.querySelectorAll<HTMLElement>('.nd-item-trailing button')].filter(
      (b) => !b.hasAttribute('disabled')
    )
    if (!removers.length) return el.focus()
    removers[Math.min(i, removers.length - 1)].focus()
  }, [items.length])

  const ctx = useMemo(() => ({ willRemove }), [willRemove])

  return (
    <FileUploadListContext.Provider value={ctx}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        /* focusable ONLY as the last resort of the removal rule above — never in the tab
           order, so it costs the keyboard nothing */
        tabIndex={-1}
        className="nd-uploadlist"
        style={style}
      >
        {/*
          THE COUNT, AND ONLY THE COUNT. `role="status"` is polite by definition, so it waits
          for a gap rather than cutting across whatever is being read. It is inside the group
          rather than beside it so a caller cannot lay it out somewhere it stops being about
          these rows, and it is hidden with the kit's own `.nd-sr-only` — the set draws no
          class of its own for it, because the thing it needed already had a name.
        */}
        <span className="nd-sr-only" role="status">
          {items.length === 1 ? '1 file' : `${items.length} files`}
        </span>
        {children}
      </div>
    </FileUploadListContext.Provider>
  )
}
