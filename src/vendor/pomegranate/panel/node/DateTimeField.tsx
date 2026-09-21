/*
  DateTimeField — a moment in time, in one field, with a flyout this kit draws.

  IT IS COMBOBOX'S SHAPE, NOT DROPDOWNSELECT'S, and the kit already contains both answers.
  DropDownSelect keeps a native control and lets the OS draw the popup; Combobox uses a
  plain text input plus a listbox it draws itself. This is the second of those: a text
  input holding a formatted value, and a calendar dialog beside it.

  WHY THE FIELD STOPPED BEING `datetime-local`. A native date input brings its OWN picker
  and browsers open it on click — so a custom flyout on top of one means two pickers
  competing for a single gesture, and the native one cannot be reliably suppressed. Giving
  up the native input costs the segment editor and locale-correct parsing, which this file
  now does by hand (see `parse`/`format` below). That is the honest price of the flyout.

  WHAT THE FLYOUT IS MADE OF: a day grid for the date, and a time picker whose SHAPE
  follows the kind. Alone it is two scrolling listboxes — choosing a time is a comparison,
  and with the whole flyout to itself there is room to show the neighbours. Under a
  calendar it is two DropDownSelects, because the grid has already spent the height and two
  columns under it made a 376px panel that the first card would clip. Same values, same
  commit; only the affordance differs, and it differs because the space does.

  The minute list steps by 5 either way — twelve rows rather than sixty.

  `kind="month"` is the same shell one rung coarser: a year header with prev/next carets
  and a twelve-cell month grid in place of the day grid. No time picker, because the value
  it holds has no time in it. Same keyboard shape too — arrows walk the grid, PageUp and
  PageDown page the axis the header names (there, the year), Home/End reach the ends.

  THE FLYOUT IS A DAY GRID AND A COARSE PANEL BEHIND IT. Pressing the header's title —
  `August 2026` — opens the coarse panel: a `Month | Year` dial with, under `Month`, a year
  pager and the twelve months, and under `Year`, a scrolling list of every year in reach.
  Pick a year and the dial turns to `Month`; pick a month and you are back on the days.
  `kind="month"` opens straight into the panel on `Month`, because there a month IS the
  value and there is no day grid under it.

  MONTH IS THE FIRST SEGMENT because the order is the errand's. You arrive from a day grid
  that already knows its year: nudging the month is the common move, changing the year the
  rare one. The common move is what is already selected.

  THE FLYOUT IS ONE HEIGHT, WHICHEVER VIEW IS UP AND WHICHEVER MONTH IS SHOWING. That is a
  rule in `node.css` — `--nd-datetime-panel`, set from the day grid's terms where a day grid
  exists and from the coarse view's own where it does not — plus the six-row padding below.
  A flyout that resized would move everything under it: on `datetime` that is the clock,
  which stepped 20px down and back on every press of the dial and 39px between a five-week
  month and a six-week one. It would also make the popup's bottom edge depend on where you
  happened to be, and that edge is where a card with `overflow: hidden` clips it.

  EACH KIND HOLDS ITS OWN HEIGHT rather than all four holding the tallest. A `month` field can
  never draw a day grid, so reserving one would be 115px of nothing; what it holds constant is
  its own two views. Measured: 315 for `datetime`, 248 for `date`, 200 for `month`, 170 for
  `time` — each of them the same in every view it has.

  MEASURED · THE CARET WAS THE ONLY WAY TO TRAVEL. The header's title used to be inert — a
  live region and nothing else — and the only movement in the whole flyout was a caret worth
  one month. Reaching August 1990 from August 2026 was 432 presses of it, and the keyboard
  was no better: the day grid never called `moveYear`, which sat in this file unreferenced.
  That is the defect this closes, and a rewrite that keeps a title you cannot press
  reintroduces it.

  THE YEARS ARE A SCROLLING LIST, AND THAT IS WHY THERE IS ONLY ONE CONTROL FOR THEM. They
  were a twelve-cell page first, with a `Year` select beside it for the years the page could
  not reach — two controls on one axis, split by DISTANCE. The split was real but it was a
  symptom: a twelve-cell window can only ever show twelve, so something else had to carry the
  other ninety-nine. A list carries all of them, so the second control has nothing left to do
  and the exception is retired rather than defended. It is also the same argument this file
  already made about hours, one axis over — see `ScrollColumn`.

  THE POPUP IS POSITIONED, NOT PORTALLED — `position: absolute; top: 100%`, exactly as
  `.nd-combobox-list` is. It is the kit's established answer and it keeps the component
  self-contained. The caveat is real and worth stating: on the board a card sets
  `overflow: hidden`, so a flyout opening near a card's bottom edge will be clipped by it.
  Combobox has always had this and it has never been fixed; whichever of the two grows a
  portal first, the other should follow.

  THE KEYBOARD IS THE APG DATE PICKER DIALOG, minus the parts this shape does not have:

    Alt+Down / the trigger   open the flyout, focus the focused day
    Escape                   close, return focus to the field — from ANY rung
    Arrow keys               ±1 day, ±1 week
    PageUp / PageDown        ±1 month
    Shift + PageUp/PageDown  ±1 year — APG's own binding, and the day grid was missing it
    Home / End               first / last day of the week
    Enter / Space            choose the focused day
    Tab                      moves through the dialog and stays inside it

  The `Month` grid repeats that shape one scale up: the arrows move a month and a row of
  three, PageUp/PageDown move a year — the axis its pager names, which is the rule that makes
  the two grids learnable as one. `Year` is a listbox rather than a grid, so it takes the
  listbox keys instead: up and down a row, Home and End to the ends, Enter or Space to
  choose. The dial itself is a radio group — one Tab stop, its own arrow keys.

  ONE ROVING TABSTOP IN THE GRID, per APG: exactly one day cell carries `tabindex="0"` and
  the arrow keys move it, so Tab passes the whole month in one step instead of thirty-one.

  ESCAPE ONLY CLOSES WHAT IS OPEN — the same divergence Combobox documents. Every consumer
  sits inside a sheet that owns Escape, so swallowing it unconditionally would strand
  someone inside that sheet.

  AND IT DOES NOT STEP BACK THROUGH THE VIEWS ON THE WAY OUT. They are one dialog seen at
  two depths, not nested things, so there is nothing open above the flyout for a first
  Escape to close. One press leaves, from wherever you are; getting back to the days is what
  picking a month already does.
*/
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { Button } from './Button'
import { DropDownSelect } from './DropDownSelect'
import { CalendarIcon, CaretIcon, ClockIcon } from './Icon'
import { SegmentedControl } from './SegmentedControl'
import { FIELD_CHROME_SIZE } from './TextField'
import type { TextFieldSize } from './TextField'
import { fieldLevel, useLevel } from './LevelContext'

/*
  THE VALUE IS THE NATIVE ONE FOR WHATEVER IT HOLDS, and there are four of them because
  there are four kinds:

    kind="datetime"   `YYYY-MM-DDTHH:mm`   — a moment
    kind="date"       `YYYY-MM-DD`         — a day
    kind="month"      `YYYY-MM`            — a month (what `<input type="month">` writes)
    kind="time"       `HH:mm`              — a time of day

  A DATE-ONLY FIELD DOES NOT CARRY `T00:00`, and a MONTH-ONLY FIELD DOES NOT CARRY `-01`.
  That would be a lie with a real cost: midnight is a time somebody might mean, and the
  first of the month is a day somebody might mean; a value that says "this day, at
  midnight" when the user only said "this day", or "the first" when the user only said
  "May", cannot be told apart from one where they did. Each kind writes exactly what it
  holds, which is also what the equivalent native input writes — so a consumer can still
  hand any of them to `new Date()`, to a backend, or to an `<input>`.

  Keeping the wire format means the string sorts correctly, too. What the FIELD shows is a
  human reading of it; the two are converted at the edges and nowhere else.
*/
export type DateTimeKind = 'datetime' | 'date' | 'month' | 'time'

/*
  WHAT THE FLYOUT IS SHOWING. `day` is the month grid; `month` and `year` are the two halves
  of the coarse panel, which share its dial and its shell. Three names rather than a `day` /
  `coarse` pair plus a second flag, because the dial's VALUE is exactly this — one piece of
  state answers both questions, so the two cannot disagree.

  It is deliberately NOT a prop. Which view is up is a position inside an open flyout, and a
  caller that could set it could also freeze it, stranding the ladder it was given.
*/
type DateTimeView = 'day' | 'month' | 'year'

const PAD = (n: number) => String(n).padStart(2, '0')

type Parts = { y: number; m: number; d: number; hh: number; mm: number }

const SHAPES: Record<DateTimeKind, RegExp> = {
  datetime: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  date: /^(\d{4})-(\d{2})-(\d{2})$/,
  month: /^(\d{4})-(\d{2})$/,
  time: /^(\d{2}):(\d{2})$/,
}

/** the wire value → parts, or null if it is not this kind's shape */
function parse(value: string, kind: DateTimeKind): Parts | null {
  const m = SHAPES[kind].exec(value)
  if (!m) return null
  const n = m.slice(1).map(Number)
  /* a month value is `YYYY-MM`, so its "day" is a stand-in of 1 — the round-trip probe
     below still catches an out-of-range month (2026-13 would roll to Jan 2027) without
     the value having to carry a day it does not hold */
  const [y, mo, d] = kind === 'time' ? [1970, 1, 1] : kind === 'month' ? [n[0], n[1], 1] : n
  const [hh, mm] = kind === 'time' ? n : kind === 'date' || kind === 'month' ? [0, 0] : n.slice(3)
  if (kind !== 'time') {
    const probe = new Date(y, mo - 1, d)
    // rejects 2026-02-31: the Date constructor rolls it forward, so a round trip catches it
    if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null
  }
  if (hh > 23 || mm > 59) return null
  return { y, m: mo, d, hh, mm }
}

const toValue = (kind: DateTimeKind, p: Parts) =>
  kind === 'time'
    ? `${PAD(p.hh)}:${PAD(p.mm)}`
    : kind === 'month'
      ? `${p.y}-${PAD(p.m)}`
      : kind === 'date'
        ? `${p.y}-${PAD(p.m)}-${PAD(p.d)}`
        : `${p.y}-${PAD(p.m)}-${PAD(p.d)}T${PAD(p.hh)}:${PAD(p.mm)}`

/*
  THE READING IS THE PLATFORM'S, and this is where the native input is genuinely missed.
  `Intl.DateTimeFormat` is the same machinery a native date input uses to decide whether a
  locale writes the day or the month first — and whether a time reads as 14:30 or 2:30 PM —
  so the field reads correctly in each without this file holding a table of formats. What
  it cannot do is PARSE that reading back, which is why typing is matched against the wire
  shapes below.
*/
const DATE_OPTS = { year: 'numeric', month: 'short', day: '2-digit' } as const
const MONTH_OPTS = { year: 'numeric', month: 'short' } as const
const TIME_OPTS = { hour: '2-digit', minute: '2-digit' } as const
const READ: Record<DateTimeKind, Intl.DateTimeFormat> = {
  datetime: new Intl.DateTimeFormat(undefined, { ...DATE_OPTS, ...TIME_OPTS }),
  date: new Intl.DateTimeFormat(undefined, DATE_OPTS),
  month: new Intl.DateTimeFormat(undefined, MONTH_OPTS),
  time: new Intl.DateTimeFormat(undefined, TIME_OPTS),
}
const format = (value: string, kind: DateTimeKind) => {
  const p = parse(value, kind)
  return p ? READ[kind].format(new Date(p.y, p.m - 1, p.d, p.hh, p.mm)) : value
}

/*
  TYPING ACCEPTS WHAT A PERSON WOULD PASTE — this kind's wire shape, and for `datetime` the
  same thing with a space instead of the `T`, which is what every database, log line and
  spreadsheet on this board would hand you. Anything else is held as typed and reported
  invalid by the caller; this component does not guess at `29/7` or `next tuesday`.
*/
const readTyped = (text: string, kind: DateTimeKind): string | null => {
  const t = kind === 'datetime' ? text.trim().replace(' ', 'T') : text.trim()
  return parse(t, kind) ? t : null
}

const MONTHS = (y: number, m: number) => new Date(y, m - 1, 1)
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate()

/** the weekday names and the first day of the week, both from the locale rather than from
    an assumption that a week starts on Monday (or on Sunday) */
const WEEK_START = 1 // Monday — `Intl.Locale.weekInfo` is not in every engine yet
const WEEKDAYS = (() => {
  const f = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
  // 2024-01-01 was a Monday, so this walks a real week in order
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)))
})()

const MONTH_NAME = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
/* the year on its own — the month grid's header, where the value below IS a month, so the
   header carries only the year the twelve cells are twelve months of */
const YEAR_NAME = new Intl.DateTimeFormat(undefined, { year: 'numeric' })
/* the twelve month labels, from the locale rather than a hardcoded list of English names.
   2024 was a leap year and any year would do — the point is a real Date so `Intl` writes
   the same short form the value's readback uses. */
const MONTH_LABELS = (() => {
  const f = new Intl.DateTimeFormat(undefined, { month: 'short' })
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(2024, i, 1)))
})()

/*
  HOW FAR THE YEAR LIST REACHES WHEN THE CALLER SAYS NOTHING. Both are relative to today
  rather than absolute, so the default does not rot — see `yearRange` for the reasoning.
*/
const YEARS_BEHIND = 100
const YEARS_AHEAD = 10

const HOURS = Array.from({ length: 24 }, (_, i) => PAD(i))
/* the same values a select wants, shaped the way it wants them */
const asOptions = (vs: string[]) => vs.map((v) => ({ value: v, label: v }))
/* five-minute steps: twelve rows instead of sixty, and finer than that is typed */
const MINUTES = Array.from({ length: 12 }, (_, i) => PAD(i * 5))

/*
  A SCROLL COLUMN — one scrolling list of values, and the listbox pattern it owes ARIA.

  IT WAS A TIME COLUMN AND IT IS NOT ANY MORE, because the argument that built it turned out
  not to be about time. It replaced two DropDownSelects on this reasoning: choosing an hour
  is a COMPARISON — you look for 14 among the hours near it — and a select shows you ONE
  value with the rest behind a second popup, a popup inside a popup to read a list that had
  room to be visible all along.

  Every word of that is true of years. So the year picker is this, and the component is named
  for the shape rather than for the first thing that wanted it.

  IT IS A LISTBOX, NOT A MENU. The options here are values, and exactly one of each column
  is chosen at any time — `aria-selected` is the state that says so, and `role="option"`
  inside `role="listbox"` is what makes a screen reader announce "14, selected, 3 of 24"
  rather than reading a wall of buttons.

  ONE ROVING TABSTOP, as in the calendar grid: the arrows move it and Tab passes the whole
  column in one press instead of twenty-four. Home and End reach the ends. Enter, Space and
  a click all choose — nothing chooses on focus alone, because arrowing THROUGH a list to
  reach 21 must not commit 15, 16, 17 on the way past.

  THE ITEMS ARE KIT BUTTONS, for the same reason the day cells are: a pressable row with
  hover, press and focus states is the question Button answers, and the three row states are
  the three variants every grid in this file uses: `primary` for the chosen value, `container`
  for `current` — the row that is a FACT rather than the value, which is what "today's year"
  is to a list of years — and `ghost` for the rest.
*/
function ScrollColumn({
  name,
  values,
  value,
  current,
  labelHidden = false,
  onPick,
}: {
  name: string
  values: string[]
  value: string
  /** the row that is true rather than chosen — drawn as a ring, never as a fill */
  current?: string
  /*
    THE CAPTION LEAVES, THE NAME STAYS — `SegmentOption`'s idiom, spelled the same way on
    purpose. Two columns side by side need visible captions to be told apart; a column that
    is the only thing under a segment already reading `Year` does not, and drawing the word
    twice in 24px of height is the kind of duplication a reader has to stop and resolve.
    What it must not lose is the listbox's accessible NAME, which is why this hides the
    caption rather than dropping it.
  */
  labelHidden?: boolean
  onPick: (v: string) => void
}) {
  const listId = useId()
  const list = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(value)

  /* keep the roving stop on the value whenever it changes from outside */
  useEffect(() => setActive(value), [value])

  /*
    THE CHOSEN VALUE IS SCROLLED TO, NOT SCROLLED PAST. A column that opens at 00:00 with
    the value forty rows down is a list you have to search before you can read. `scrollTop`
    rather than `scrollIntoView`, which would also scroll the PAGE — and the flyout is
    already positioned against a field that must not move.

    MEASURED WITH RECTS, NOT `offsetTop`, and that distinction was a bug before it was a
    comment. `offsetTop` is relative to the nearest POSITIONED ancestor, and this list is
    not positioned — so it resolved against the flyout, and in the `datetime` kind the
    calendar's whole height got added to every row's offset. Both columns opened scrolled
    to their last values. It looked right in `time`, where there is no calendar above to
    add, which is exactly the sort of near-miss a second layout hides.

    A rect delta asks the question directly — how far is this row from the top of its
    scroller — and cannot be wrong about who it is measuring against.
  */
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!box || !el) return
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top
    box.scrollTop += delta - (box.clientHeight - el.offsetHeight) / 2
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (delta: number) => {
    const i = values.indexOf(active)
    const next = values[Math.min(values.length - 1, Math.max(0, i + delta))]
    setActive(next)
    const el = list.current?.querySelector<HTMLElement>(`[data-v="${next}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    if (k === 'ArrowDown') { e.preventDefault(); move(1); return }
    if (k === 'ArrowUp') { e.preventDefault(); move(-1); return }
    if (k === 'Home') { e.preventDefault(); setActive(values[0]); list.current?.querySelector<HTMLElement>(`[data-v="${values[0]}"]`)?.focus(); return }
    if (k === 'End') { e.preventDefault(); const last = values[values.length - 1]; setActive(last); list.current?.querySelector<HTMLElement>(`[data-v="${last}"]`)?.focus(); return }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); onPick(active) }
  }

  return (
    <div className="nd-datetime-col">
      <span className={labelHidden ? 'nd-sr-only' : 'nd-datetime-collabel'} id={listId}>
        {name}
      </span>
      <div ref={list} role="listbox" aria-labelledby={listId} className="nd-datetime-list" onKeyDown={onKeyDown}>
        {values.map((v) => (
          <Button
            key={v}
            variant={v === value ? 'primary' : v === current ? 'tonal' : 'ghost'}
            size={FIELD_CHROME_SIZE}
            block
            glass={false}
            dynamicLight={false}
            role="option"
            aria-selected={v === value}
            tabIndex={v === active ? 0 : -1}
            data-v={v}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPick(v)}
          >
            {v}
          </Button>
        ))}
      </div>
    </div>
  )
}

type DateTimeBase = {
  /** `YYYY-MM-DDTHH:mm`. Empty string is "no moment chosen". */
  value: string
  onChange: (value: string) => void
  /** the accessible name. Required, as it is on every field in this kit. */
  label: string
  style?: CSSProperties
  block?: boolean
  size?: TextFieldSize
  disabled?: boolean
  readOnly?: boolean
  /*
    WHAT THIS FIELD HOLDS — a moment, a day, a month, or a time of day. It is a variant
    rather than four components because the four differ in exactly ONE decision: which
    parts of a moment exist. Everything else — the shell, the flyout's surface, the
    typing, the keyboard, every prop — is shared and none of it goes inert. That is the
    test this kit applies: TextField and TextArea split because almost every decision
    forked between them; these do not fork at all, they truncate.
  */
  kind?: DateTimeKind
  /*
    THE YEARS THE `Year` LIST HOLDS — every one of them, as rows. `[thisYear - 100,
    thisYear + 10]` by default: a hundred behind is what a birth date needs, the canonical
    reason anyone opens a picker on a distant year, and ten ahead is what a scheduled thing
    needs.

    IT EXISTS BECAUSE A LIST HAS ENDS AND A GRID DOES NOT. Carets and arrow keys can page
    forever; anything that ENUMERATES has to be told where to stop. That is the whole of its
    job, and it is why the prop appeared with the list rather than with the ladder.

    IT BOUNDS THAT LIST AND NOTHING ELSE — not typing, and not the day or month carets, which
    still page past either end. This component has no validity model of its own (`invalid` is
    the caller's answer, never one the field derives), and a picker that silently refused a
    year the same field accepts typed would be two controls wearing one label. If a range is
    a RULE rather than a reach, the caller still owns saying so.
  */
  yearRange?: [number, number]
  /** a leading slot — any node, centred on the value row */
  icon?: ReactNode
  /** a second, quieter value at the far end — the same slot every field in the kit carries */
  hint?: ReactNode
}

type DateTimeValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type DateTimeFieldProps = DateTimeBase & DateTimeValidity

export function DateTimeField({
  value,
  onChange,
  label,
  size = 'small',
  block = false,
  invalid = false,
  describedBy,
  disabled = false,
  readOnly = false,
  kind = 'datetime',
  yearRange,
  icon,
  hint,
  style,
}: DateTimeFieldProps) {
  const id = useId()
  const dialogId = `${id}-flyout`
  const root = useRef<HTMLSpanElement>(null)
  const control = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  /* what the user has typed, while they are typing it. Null means "show the value" —
     the field must not rewrite the text under a caret that is mid-edit. */
  const [draft, setDraft] = useState<string | null>(null)

  const parsed = parse(value, kind)
  const today = useMemo(() => new Date(), [])
  /* the month the grid is showing, and the day the roving tabstop is on. Both start from
     the value when there is one and from today when there is not. */
  const [cursor, setCursor] = useState(() =>
    parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : new Date(today.getFullYear(), today.getMonth(), today.getDate())
  )

  const editable = !disabled && !readOnly
  /* which halves of the flyout exist. `time` has no day grid and `date` no clock; `month`
     has neither — it draws a twelve-cell month grid instead. A control that draws a picker
     for a part of a value it does not hold is offering to set something it will then
     throw away. */
  const hasDate = kind === 'datetime' || kind === 'date'
  const hasTime = kind === 'datetime' || kind === 'time'
  const isMonth = kind === 'month'
  const shown = draft ?? (value === '' ? '' : format(value, kind))

  /*
    THE VIEW THIS KIND OPENS ON. A `month` value has no day in it, so it opens on the coarse
    panel's `Month` segment — there is no day grid under it to fall back to, and picking a
    month there COMMITS rather than returning. Every other date kind opens on the day grid
    and treats the panel as a place it passes through. One flag, read in three places, rather
    than three kinds of "is this the end of the errand" scattered through the handlers.
  */
  const floorView: DateTimeView = isMonth ? 'month' : 'day'
  const [view, setView] = useState<DateTimeView>(floorView)

  /*
    EVERY OPENING STARTS AT THE KIND'S OWN VIEW, AND AT THE VALUE. A flyout that reopened on
    the `Year` segment because that is where the last visit ended would be answering a
    question nobody asked twice — the common case is "a day near the one I am on", and the
    coarse panel is for the rare one.

    RE-AIMING THE CURSOR IS THE SAME DECISION AND IT IS NEW. The cursor has always survived
    a close, and it never mattered: the only way to move it was a caret worth one month, so
    a flyout dismissed without committing reopened a month or two off the value at worst.
    With the ladder it can be a hundred years off — climb to 1926, change your mind, press
    Escape, and the next press of the trigger opens on a month nobody has been near. The
    ladder is what makes an abandoned journey expensive, so the ladder is what has to pay
    for it: opening is a fresh start from the value, or from today when there is none.

    Keyed on `open` rather than on close, so a kind or a value that changes while shut still
    lands right.
  */
  useEffect(() => {
    if (!open) return
    setView(floorView)
    setCursor(
      parsed
        ? new Date(parsed.y, parsed.m - 1, parsed.d)
        : new Date(today.getFullYear(), today.getMonth(), today.getDate())
    )
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cursorYear = cursor.getFullYear()
  const [minYear, maxYear] = yearRange ?? [
    today.getFullYear() - YEARS_BEHIND,
    today.getFullYear() + YEARS_AHEAD,
  ]
  /*
    EVERY YEAR IN REACH, AS ROWS. Strings because that is the vocabulary `ScrollColumn`
    speaks — the same one the hour and minute columns speak — and the number is read back at
    the one edge that needs it. Memoised because the list is a hundred and eleven rows by
    default and the flyout re-renders on every cursor move.
  */
  const yearValues = useMemo(
    () => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(minYear + i)),
    [minYear, maxYear]
  )

  /* re-aim the grid whenever the value changes from outside — a sheet reverting a draft
     must not leave the flyout showing a month the value is no longer in */
  useEffect(() => {
    if (parsed) setCursor(new Date(parsed.y, parsed.m - 1, parsed.d))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
    A PRESS OUTSIDE CLOSES IT. `pointerdown` rather than `click`, so the flyout is gone
    before whatever was pressed reacts — a click-based close lets the press land on the
    thing underneath while the dialog is still up. The listener only exists while open.
  */
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  /*
    FOCUS FOLLOWS THE ROVING TABSTOP, and the dependency is the whole DAY rather than the
    month.

    It read `[open, month, year]` first, which moved focus only when a key crossed into
    another month: pressing ArrowRight inside July moved the tabstop to the 30th and left
    the ring on the 29th, so the grid showed one cell as focused and treated another as
    current. A roving tabstop that the focus does not follow is not a roving tabstop — it
    is a second, invisible cursor.

    `getTime()` rather than the Date object: a new Date is minted on every move, so
    identity would re-fire this on every render while the value it stands for is unchanged.
  */
  useEffect(() => {
    if (!open) return
    /*
      NEVER TAKE THE FOCUS OFF A CONTROL SOMEBODY IS USING. This effect moves focus into the
      grid, and once the flyout grew chrome that CHANGES the grid — the Year/Month dial and
      the year select — that became a focus thief: arrowing from `Year` to `Month` changed
      `view`, this fired, and the focus landed in the grid, so the next arrow key moved a
      month cell instead of the dial. A two-segment control you cannot arrow across twice.

      The guard is the whole rule in one line: if the focus is already inside the flyout but
      outside the grid, it is on chrome, and chrome keeps it. Every case that SHOULD pull
      focus survives it, because in each one the element that had the focus is gone by the
      time this runs — opening (the focus is on the trigger, outside the flyout), lifting from
      the day grid (the title button unmounts with the header), descending from a cell (the
      cell unmounts with its grid). React has already committed the DOM, so `activeElement`
      has fallen back to the body and there is nothing to protect.

      IT ALSO FIXES THE PAGER, which had the same bug in a milder form: clicking `‹` moved the
      focus off the caret and into the grid, so a second page needed a second aim. Now the
      caret keeps it and pages as many times as you press it.

      WHAT IT RESTS ON, stated because it is a real limit: `activeElement` after a POINTER
      press. Safari does not focus a `<button>` on click, so there the caret and the cells
      fall through to the old behaviour — the focus lands in the grid — which is a lost nicety
      rather than a break. The case that actually breaks without this guard is the dial, and
      that one is a form control: every engine focuses a radio on click, so the fix holds
      exactly where it has to.
    const active = document.activeElement
    if (active && flyRef.current?.contains(active) && !gridRef.current?.contains(active)) return

    /* the grid owns the focus when there is one; a time-only flyout has no grid, so the
       first thing in it takes the focus instead — an opened dialog that focuses nothing
       leaves a keyboard user with no way in */
    const day = gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')
    if (day) day.focus()
    else flyRef.current?.querySelector<HTMLElement>('.nd-datetime-list [tabindex="0"]')?.focus()
    /*
      `view` IS A DEPENDENCY AND IT IS NOT OPTIONAL. Climbing a rung leaves the cursor
      exactly where it was — August 2026 stays August 2026 when the month grid opens over
      it — so a deps list of `[open, cursor]` alone fires nothing, and the ring stays on
      the day cell that just stopped existing. A grid whose roving tabstop the focus does
      not follow is not a roving tabstop; it is a second, invisible cursor.
    */
  }, [open, view, cursor.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeAndReturn = () => {
    setOpen(false)
    control.current?.focus()
  }

  const commit = (y: number, m: number, d: number, hh = parsed?.hh ?? 0, mm = parsed?.mm ?? 0) => {
    setDraft(null)
    onChange(toValue(kind, { y, m, d, hh, mm }))
  }

  /* typing: hold the text as typed, and only write a value when it reads as one */
  const handleType = (text: string) => {
    if (!editable) return
    setDraft(text)
    const wire = readTyped(text, kind)
    if (wire) onChange(wire)
    else if (text.trim() === '') onChange('')
  }

  const handleFieldKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && e.altKey && editable) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (e.key === 'Escape' && open) {
      /* only swallow it if there was a flyout to close — see the header */
      e.preventDefault()
      e.stopPropagation()
      closeAndReturn()
    }
  }

  /* the month being drawn, as a flat list of cells with the leading blanks the grid needs */
  const first = MONTHS(cursor.getFullYear(), cursor.getMonth() + 1)
  const lead = (first.getDay() - WEEK_START + 7) % 7
  const count = daysIn(cursor.getFullYear(), cursor.getMonth() + 1)
  /*
    SIX WEEK ROWS, ALWAYS — the trailing blanks are padding to a fixed grid, not days.

    A month spans four to six weeks depending on where its first day falls, so a grid sized
    to its content changed height as you paged it: July 2026 drew five rows and March 2026
    drew six, and the flyout stepped 39px between them. Everything under it moved with that —
    on `datetime` the clock — and the popup's bottom edge, which is where a card with
    `overflow: hidden` clips it, moved too.

    SIX IS THE CEILING, NOT A CHOICE: 31 days with six leading blanks is 37 cells, which is
    six rows, and nothing can need a seventh. So a grid that always draws six is always big
    enough and never changes, which is the property the whole panel's height rests on.
  */
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ]
  while (cells.length < 42) cells.push(null)

  const moveCursor = (days: number) => {
    const next = new Date(cursor)
    next.setDate(next.getDate() + days)
    setCursor(next)
  }
  const moveMonth = (months: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + months, 1)
    // keep the day where it can be kept: 31 Jan + 1 month is 28/29 Feb, not 3 March
    next.setDate(Math.min(cursor.getDate(), daysIn(next.getFullYear(), next.getMonth() + 1)))
    setCursor(next)
  }
  const moveYear = (years: number) => {
    /* the same day-clamp as moveMonth — a Feb 29 cursor moved to a non-leap year would
       roll to March 1 otherwise, and paging by year should never quietly cross a month
       boundary */
    const next = new Date(cursor.getFullYear() + years, cursor.getMonth(), 1)
    next.setDate(Math.min(cursor.getDate(), daysIn(next.getFullYear(), next.getMonth() + 1)))
    setCursor(next)
  }
  const jumpToMonth = (m0: number) => {
    const next = new Date(cursor.getFullYear(), m0, 1)
    next.setDate(Math.min(cursor.getDate(), daysIn(next.getFullYear(), next.getMonth() + 1)))
    setCursor(next)
  }
  /*
    THE YEAR RUNG'S ONLY MOVE, and every key and caret on that rung goes through it.

    IT CLAMPS RATHER THAN STOPS. A grid whose arrows sometimes do nothing at the edge is
    indistinguishable from one that has stopped responding, so ArrowLeft on the first year
    of the range lands ON that year instead of nowhere. The same day-clamp as `moveMonth`
    and `moveYear` rides along: a Feb 29 cursor moved to a non-leap year must not roll into
    March, because moving along the YEAR axis may never quietly cross a month boundary.
  */
  const jumpToYear = (y: number) => {
    const target = Math.min(maxYear, Math.max(minYear, y))
    const next = new Date(target, cursor.getMonth(), 1)
    next.setDate(Math.min(cursor.getDate(), daysIn(target, cursor.getMonth() + 1)))
    setCursor(next)
  }

  /*
    THE MONTH GRID'S KEYBOARD — the same shape as the day grid's, one rung coarser.

    Left/Right move a month; Up/Down move a ROW, which in a 3-column grid is three months,
    so the visible movement matches what the keys do on the day grid. PageUp/PageDown page
    the YEAR — the same distance the day grid's PageUp/PageDown page the month, because
    every kind's "one page up" is the axis its header names. Home/End jump to Jan/Dec of
    the focused year. Enter or Space commit the focused month.

    Crossing December wraps to next January the way the day grid crosses month boundaries:
    silently, because the value the user is picking is a year-month, not a "position in the
    current year", and the flyout should let them keep moving without paging first.
  */
  const handleMonthKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    if (k === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeAndReturn()
      return
    }
    if (k === 'ArrowLeft') { e.preventDefault(); moveMonth(-1); return }
    if (k === 'ArrowRight') { e.preventDefault(); moveMonth(1); return }
    if (k === 'ArrowUp') { e.preventDefault(); moveMonth(-3); return }
    if (k === 'ArrowDown') { e.preventDefault(); moveMonth(3); return }
    if (k === 'PageUp') { e.preventDefault(); moveYear(-1); return }
    if (k === 'PageDown') { e.preventDefault(); moveYear(1); return }
    if (k === 'Home') { e.preventDefault(); jumpToMonth(0); return }
    if (k === 'End') { e.preventDefault(); jumpToMonth(11); return }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault()
      pickMonth(cursor.getMonth())
    }
  }

  /*
    ONE MONTH CELL, CHOSEN — and what that MEANS forks on the kind, which is the only place
    the three rungs are not identical.

    For `kind="month"` the coarse panel is the whole picker: the month IS the value, so
    choosing commits and closes. For a date or a datetime the panel is a place the errand
    passes through on the way back down, so choosing sets the cursor and returns to the day
    grid without writing anything. Committing there would be the picker answering a question
    — WHICH day — that the person has not been asked yet.

    Both routes go through this function so the click and the Enter key cannot drift apart;
    that pair drifting is how a grid ends up committing on one input and not the other.
  */
  function pickMonth(m0: number) {
    if (isMonth) {
      /* a month value's day is a stand-in — commit's default of 1 is what toValue drops */
      commit(cursor.getFullYear(), m0 + 1, 1)
      closeAndReturn()
      return
    }
    jumpToMonth(m0)
    setView('day')
  }

  const handleGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key
    if (k === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeAndReturn()
      return
    }
    if (k === 'ArrowLeft') { e.preventDefault(); moveCursor(-1); return }
    if (k === 'ArrowRight') { e.preventDefault(); moveCursor(1); return }
    if (k === 'ArrowUp') { e.preventDefault(); moveCursor(-7); return }
    if (k === 'ArrowDown') { e.preventDefault(); moveCursor(7); return }
    /*
      SHIFT PAGES THE YEAR, and its absence was half of the defect the ladder closes. APG's
      date picker dialog names this binding and `moveYear` was already written for the month
      kind — the day grid simply never called it, so the keyboard's coarsest move was one
      month and there was no year key at all.
    */
    if (k === 'PageUp') { e.preventDefault(); e.shiftKey ? moveYear(-1) : moveMonth(-1); return }
    if (k === 'PageDown') { e.preventDefault(); e.shiftKey ? moveYear(1) : moveMonth(1); return }
    if (k === 'Home') { e.preventDefault(); moveCursor(-((cursor.getDay() - WEEK_START + 7) % 7)); return }
    if (k === 'End') { e.preventDefault(); moveCursor(6 - ((cursor.getDay() - WEEK_START + 7) % 7)); return }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault()
      commit(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())
      closeAndReturn()
    }
  }

  /*
    ONE HEIGHT FOR EVERY VIEW, and the class is what tells `node.css` which height to hold.

    A flyout that resized as you moved between the days, the months and the years would move
    everything under it and would clip differently depending on where you happened to be.
    `has-days` says a day grid EXISTS in this kind — not that it is the one on screen — because
    the day grid is the tallest view and the others have to reserve its height whether or not
    they are showing it. `kind="month"` has no day grid at all, so its panel holds the coarse
    view's own height instead of reserving space for a grid it can never draw.
  */
  const panelClass = ['nd-datetime-panel', hasDate ? 'has-days' : ''].filter(Boolean).join(' ')

  const isChosen = (d: number) =>
    !!parsed && parsed.y === cursor.getFullYear() && parsed.m === cursor.getMonth() + 1 && parsed.d === d
  const isToday = (d: number) =>
    today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth() && today.getDate() === d

  return (
    <span
      ref={root}
      /* invalid is a scheme, and the island is the whole component — see TextField's note */
      data-scheme={invalid ? 'error' : undefined}
      /*
        ONE RUNG OFF ITS GROUND — the step LevelContext computes, since CSS cannot. Without
        the attribute `--nd-field-fill` is undeclared (it lives in exactly one block, keyed on
        `[data-fill]`), so `background: var(--nd-field-fill)` is invalid at computed-value time
        and this surface paints NOTHING. Invisible on a matching ground, which is how it
        shipped; a 72-coordinate browser sweep is what found it.
      */
      data-fill={fieldLevel(useLevel())}
      className={[
        'nd-textfield-wrap',
        `s-${size}`,
        block ? 'is-block' : '',
        disabled ? 'is-disabled' : '',
        readOnly && !disabled ? 'is-readonly' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {icon && (
        <span className="nd-textfield-leadbox" aria-hidden>
          {icon}
        </span>
      )}
      <label className="nd-textfield-float" htmlFor={id}>
        {label}
      </label>
      <input
        ref={control}
        id={id}
        className={[
          'nd-textfield',
          `s-${size}`,
          invalid ? 'is-invalid' : '',
          disabled ? 'is-disabled' : '',
          readOnly && !disabled ? 'is-readonly' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="text"
        value={shown}
        disabled={disabled}
        readOnly={readOnly}
        /* the identifier contract, as on every typed field here: no autocorrect turning a
           pasted timestamp into prose */
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleFieldKey}
        onBlur={() => setDraft(null)}
        onChange={(e) => handleType(e.target.value)}
      />
      {hint != null && <span className="nd-textfield-hint">{hint}</span>}
      {editable && (
        <span className="nd-textfield-trailbox">
          <Button
            variant="ghost"
            kind="icon-button"
            size={FIELD_CHROME_SIZE}
            glass={false}
            label={
              open
                ? 'Hide picker'
                : isMonth
                  ? 'Choose a month'
                  : hasDate
                    ? hasTime ? 'Choose date and time' : 'Choose a date'
                    : 'Choose a time'
            }
            /* the glyph names what the flyout holds — a calendar over a control that only
               picks a time is a label for the wrong thing. A month picker still opens a
               calendar (year + month), so the calendar glyph is right for it too. */
            leading={hasDate || isMonth ? <CalendarIcon /> : <ClockIcon />}
            /* out of the tab sequence, as Combobox's toggle is: the field already opens
               the flyout with Alt+Down, so this is the pointer affordance */
            tabIndex={-1}
            aria-expanded={open}
            aria-controls={open ? dialogId : undefined}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={() => (open ? closeAndReturn() : setOpen(true))}
          />
        </span>
      )}

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label={`${label} — ${
            isMonth
              ? 'choose a month'
              : hasDate
                ? hasTime ? 'choose a date and time' : 'choose a date'
                : 'choose a time'
          }`}
          className="nd-datetime-flyout"
          /* a flyout is a REGION that floats, so it is a level island at the top rung —
             its own ground, and the accent that belongs to it (tokens.css, THE FILL AXIS) */
          data-level={4}
          ref={flyRef}
        >
          {/*
            TWO SHAPES, ONE SHELL — a header, then a grid of the same 24px cells. The day
            grid's header is a pager whose TITLE is a button: it names where you are and
            pressing it zooms out, which is the affordance every map in the world uses. The
            coarse panel's header is that pager with a dial above it.

            WHICH SHAPES A KIND HAS is the only thing that varies. `date` and `datetime` get
            both; `month` gets only the coarse panel, because it has no day grid to stand on;
            `time` has neither and renders nothing here.

            THE HEADERS ARE NOT FACTORED OUT INTO A COMPONENT, deliberately. They differ in
            what the title says, whether it can be pressed at all, what the carets step by,
            whether the carets ever disable, and whether a dial sits above them. That is five
            forks in a six-line shape: a shared header would be one component with five
            conditionals inside it, which is the same code one level further from the thing
            it draws.
          */}
          {view === 'day' && hasDate && (
            <div className={panelClass}>
              <div className="nd-datetime-head">
                <Button
                  variant="ghost"
                  kind="icon-button"
                  size={FIELD_CHROME_SIZE}
                  glass={false}
                  label="Previous month"
                  leading={<CaretIcon className="nd-datetime-prev" />}
                  onClick={() => moveMonth(-1)}
                />
                {/*
                  THE TITLE IS A BUTTON NOW, and the live region moved OUT to the box around
                  it. Announcing a paged month is still the one thing a sighted user gets for
                  free and a screen reader does not — but a live region that is also the
                  control announces its own accessible NAME when the text under it changes,
                  so "August 2026, choose a month" would be read on every caret press. The
                  wrapper carries the region, the button carries the name, and each says its
                  own thing once.
                */}
                <span className="nd-datetime-title" aria-live="polite">
                  <Button
                    variant="ghost"
                    size={FIELD_CHROME_SIZE}
                    glass={false}
                    dynamicLight={false}
                    block
                    aria-label={`${MONTH_NAME.format(first)} — choose a month`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setView('month')}
                  >
                    {MONTH_NAME.format(first)}
                  </Button>
                </span>
                <Button
                  variant="ghost"
                  kind="icon-button"
                  size={FIELD_CHROME_SIZE}
                  glass={false}
                  label="Next month"
                  leading={<CaretIcon className="nd-datetime-next" />}
                  onClick={() => moveMonth(1)}
                />
              </div>

              <div className="nd-datetime-week" aria-hidden>
                {WEEKDAYS.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>

              {/*
                `role="grid"` with one roving tabstop. The cells are buttons so they are
                operable and announced without this file reimplementing either, and the grid
                owns the arrow keys so Tab leaves the month in one press.
              */}
              <div ref={gridRef} role="grid" className="nd-datetime-grid" onKeyDown={handleGridKey}>
                {cells.map((d, i) =>
                  d === null ? (
                    <span key={`b${i}`} className="nd-datetime-blank" />
                  ) : (
                    <Button
                      key={d}
                      /*
                        THE THREE DAY STATES ARE THREE BUTTON VARIANTS, which is the reason
                        these are kit Buttons rather than the bespoke `<button>`s they started
                        as. `primary` is the chosen day — the accent fill, the same one every
                        committed choice in this kit wears. `container` is today: the container
                        fill, which is a FACT about the calendar rather than the VALUE the
                        accent marks, so the two never read as one choice. `ghost` is every
                        other day.

                        That mapping is the whole argument. A 24px pressable square with hover,
                        press and focus states is exactly the question Button answers, and a
                        component that hand-rolls one is the disease this kit was built to cure
                        — nine fields under five class names, one level down.
                      */
                      variant={isChosen(d) ? 'primary' : isToday(d) ? 'tonal' : 'ghost'}
                      kind="icon-button"
                      size={FIELD_CHROME_SIZE}
                      /* a control on someone else's surface: the flyout is the surface */
                      glass={false}
                      /* forty-two buttons registering for cursor-tracked rim light, to move a
                         highlight nothing here draws, is a per-frame loop for nothing */
                      dynamicLight={false}
                      /* no `className` — Button closes it on purpose, so the grid reaches its
                         cells by descent instead. That is the constraint working: a caller
                         that could restyle a Button could undo the states it just inherited. */
                      role="gridcell"
                      /* NOT `active` — that sets aria-pressed, which says "toggle". A day in a
                         grid is selected, not pressed. */
                      aria-selected={isChosen(d)}
                      tabIndex={d === cursor.getDate() ? 0 : -1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        commit(cursor.getFullYear(), cursor.getMonth() + 1, d)
                        closeAndReturn()
                      }}
                    >
                      {d}
                    </Button>
                  )
                )}
              </div>
            </div>
          )}

          {(view === 'month' || view === 'year') && (hasDate || isMonth) && (
            <div className={panelClass}>
              {/*
                THE COARSE PANEL IS ONE SURFACE WITH A DIAL ON IT, not two rungs stacked.

                They were stacked: the month grid's title lifted to a year grid the way the
                day grid's lifts to the month. That put the year TWO presses deep and, worse,
                made "which of these am I looking at" a thing you had to remember rather than
                read. A dial says it: both names visible at once, either one press from the
                other in BOTH directions, which a lift can never be because a lift only goes
                up.

                MONTH IS THE FIRST SEGMENT, and the order is the errand's. You arrive here
                from a day grid that already knows its year — nudging the month is the common
                move and changing the year is the rare one — so the common move is the one
                already selected, and the rare one is a press away rather than the thing you
                have to press past. `kind="month"` opens here too, on the same segment, for
                the same reason: there the month IS the value.

                IT IS A DIAL, NOT A TAB SET, and `SegmentedControl`'s header draws that line
                explicitly. The two segments do not switch between independent views; they
                choose WHICH PART OF A DATE you are about to pick, and what sits under one is
                that choice's input surface. "Month, radio button, 1 of 2" is an accurate
                reading of that, which is the test.

                `block` so it governs the panel rather than sitting on it. It fills the flyout,
                which is now the field's width, and a hugging control at the top of a box this
                wide reads as a stray chip rather than as the thing everything below answers to.
              */}
              <SegmentedControl
                label="Pick a month or a year"
                block
                size={FIELD_CHROME_SIZE}
                value={view}
                options={[
                  { value: 'month', label: 'Month' },
                  { value: 'year', label: 'Year' },
                ]}
                onChange={(v) => setView(v as DateTimeView)}
              />

              {view === 'month' ? (
                <>
                  {/*
                    THE PAGER BELONGS TO THE MONTH SEGMENT AND ONLY TO IT.

                    It names the year the twelve cells are twelve months of — the rule every
                    header in this flyout follows, that a header names the axis its carets step
                    and its cells divide — and it keeps that year legible while you are picking
                    a month, which a bare dial would have lost. Its carets nudge one year,
                    which is the small correction the `Year` segment would be a whole trip for.

                    THE YEAR SEGMENT HAS NO PAGER, because there is nothing left for one to do:
                    the list under it holds every year in reach at once, so a control that moved
                    a window over it would be a second answer to a question already answered.
                  */}
                  <div className="nd-datetime-head">
                    <Button
                      variant="ghost"
                      kind="icon-button"
                      size={FIELD_CHROME_SIZE}
                      glass={false}
                      label="Previous year"
                      leading={<CaretIcon className="nd-datetime-prev" />}
                      onClick={() => moveYear(-1)}
                    />
                    <span className="nd-datetime-title" aria-live="polite">
                      <span className="nd-datetime-month">{YEAR_NAME.format(new Date(cursorYear, 0, 1))}</span>
                    </span>
                    <Button
                      variant="ghost"
                      kind="icon-button"
                      size={FIELD_CHROME_SIZE}
                      glass={false}
                      label="Next year"
                      leading={<CaretIcon className="nd-datetime-next" />}
                      onClick={() => moveYear(1)}
                    />
                  </div>

                  {/*
                    THE MONTH GRID. `primary` for the chosen month, `container` for the current
                    one (the container fill, because "this month" is a fact and the chosen month
                    is the value), `ghost` for the rest — the day grid's mapping, one rung coarser. No
                    `kind="icon-button"`: a month cell reads a word rather than a number, and it
                    fills its `1fr` track from the CSS side.
                  */}
                  <div ref={gridRef} role="grid" className="nd-datetime-months" onKeyDown={handleMonthKey}>
                    {MONTH_LABELS.map((name, i) => {
                      const monthNum = i + 1
                      const chosen = !!parsed && parsed.y === cursorYear && parsed.m === monthNum
                      const current = today.getFullYear() === cursorYear && today.getMonth() === i
                      return (
                        <Button
                          key={monthNum}
                          variant={chosen ? 'primary' : current ? 'tonal' : 'ghost'}
                          size={FIELD_CHROME_SIZE}
                          glass={false}
                          dynamicLight={false}
                          role="gridcell"
                          aria-selected={chosen}
                          tabIndex={i === cursor.getMonth() ? 0 : -1}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => pickMonth(i)}
                        >
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                </>
              ) : (
                /*
                  THE YEARS ARE A SCROLLING LIST, NOT A GRID, and the argument is the one the
                  hour column already made in this file: choosing a year is a COMPARISON — you
                  look for 1990 among the years near it — and every alternative shows you less
                  of that neighbourhood than a list does.

                  IT REPLACED A TWELVE-CELL PAGE AND A `Year` SELECT, which were two controls
                  for one axis: the page for years you could see, the select for years you could
                  not. That split was real but it was a symptom — both existed because a
                  twelve-cell window can only ever show twelve, so a second control had to carry
                  the rest. A list carries all of them, so the second control has nothing left
                  to do and the exception this kit was making for it is retired rather than
                  defended. The select was also the worse half on its own terms: a popup inside
                  a popup, showing ONE year while the flyout had room to show fifteen.

                  IT OPENS SCROLLED TO THE YEAR IT IS ON, measured with rects — see
                  `ScrollColumn`, where that was a bug before it was a comment.

                  PICKING A YEAR TURNS THE DIAL TO `Month`, because a year is never the end of
                  the errand: no kind this field writes is a year. The dial moving itself is
                  honest here — it reports where you now are rather than guessing where you
                  want to go — and it is also the way back, since the segment you came from is
                  the segment you land on.
                */
                <ScrollColumn
                  name="Year"
                  labelHidden
                  values={yearValues}
                  value={String(Math.min(maxYear, Math.max(minYear, cursorYear)))}
                  current={String(today.getFullYear())}
                  onPick={(y) => {
                    jumpToYear(Number(y))
                    setView('month')
                  }}
                />
              )}
            </div>
          )}

          {hasTime && (
          <div className={['nd-datetime-time', hasDate ? '' : 'is-alone'].filter(Boolean).join(' ')}>
          {/*
            THE TIME PICKER CHANGES SHAPE WITH THE KIND, and the reason is what is ABOVE it.

            ALONE (`kind="time"`) it is two scrolling LISTBOXES. Choosing a time is a
            comparison — you look for 14 among the hours near it — and with the whole flyout
            to itself there is room to show the neighbours. A select here would be a popup
            inside a popup, to read a list that had space to be visible all along.

            UNDER A CALENDAR (`kind="datetime"`) it is two DropDownSelects. The month grid
            has already spent the flyout's height, and two 120px columns under it took the
            popup to 376 — a panel, not a flyout, and one that the first card it lands on
            will clip. A select is one row tall and puts its own list where there is room
            for it, which is exactly the trade the taller shape cannot make.

            Same values, same commit, same fallback to the day the calendar is showing when
            a time is chosen before a date. Only the affordance differs, and it differs
            because the space does.
          */}
            {hasDate ? (
              <>
                <DropDownSelect
                  label="Hour"
                  size={FIELD_CHROME_SIZE}
                  value={PAD(parsed?.hh ?? 0)}
                  options={asOptions(HOURS)}
                  onChange={(hh) => {
                    const base = parsed ?? { y: cursor.getFullYear(), m: cursor.getMonth() + 1, d: cursor.getDate(), mm: 0 }
                    commit(base.y, base.m, base.d, Number(hh), base.mm)
                  }}
                />
                <span className="nd-datetime-colon" aria-hidden>
                  :
                </span>
                <DropDownSelect
                  label="Minute"
                  size={FIELD_CHROME_SIZE}
                  value={PAD(parsed?.mm ?? 0)}
                  options={asOptions(MINUTES)}
                  onChange={(mm) => {
                    const base = parsed ?? { y: cursor.getFullYear(), m: cursor.getMonth() + 1, d: cursor.getDate(), hh: 0 }
                    commit(base.y, base.m, base.d, base.hh, Number(mm))
                  }}
                />
              </>
            ) : (
              <>
                <ScrollColumn
                  name="Hour"
                  values={HOURS}
                  value={PAD(parsed?.hh ?? 0)}
                  onPick={(hh) => {
                    const base = parsed ?? { y: cursor.getFullYear(), m: cursor.getMonth() + 1, d: cursor.getDate(), mm: 0 }
                    commit(base.y, base.m, base.d, Number(hh), base.mm)
                  }}
                />
                <ScrollColumn
                  name="Minute"
                  values={MINUTES}
                  value={PAD(parsed?.mm ?? 0)}
                  onPick={(mm) => {
                    const base = parsed ?? { y: cursor.getFullYear(), m: cursor.getMonth() + 1, d: cursor.getDate(), hh: 0 }
                    commit(base.y, base.m, base.d, base.hh, Number(mm))
                  }}
                />
              </>
            )}
          </div>
          )}
        </div>
      )}
    </span>
  )
}
