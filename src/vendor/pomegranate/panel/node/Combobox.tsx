/*
  Combobox — type to filter, then pick. The third of the four "dropdown" components.

    DropDownSelect  role=listbox   picks a VALUE from a fixed set — the platform's popup
    Menu            role=menu      fires an ACTION — no value, no form
    Combobox        role=combobox  type to filter, then pick          ← this one
    Popover         no role        arbitrary content in a floating layer

  WHY IT EXISTS: THE BOARD APP THIS KIT GREW OUT OF HAD THREE OF THEM, hand-rolled, and
  they disagreed with each other and with the spec. (The app and all three are deleted;
  the census is kept because it is the argument for every wire this file carries.)

    ValueSheet   TextField + <div role="listbox">      no arrow keys, no ARIA wiring
    Omnibox      raw <input class="ob-input"> + buttons arrow keys,   no ARIA wiring
    TokenPanel   raw <input> + <div role="listbox">     no arrow keys, no ARIA wiring

  Not one of the three set `role="combobox"`, `aria-expanded`, `aria-controls` or
  `aria-activedescendant`, so in every case the field and the list it filtered were
  UNCONNECTED IN THE ACCESSIBILITY TREE: you typed, the list silently re-filtered, and a
  screen reader was told nothing at all. Two of the three had no keyboard route into the
  list whatsoever — you could filter with the keyboard but only pick with a mouse.

  ===========================================================================
  THE FIVE DECISIONS, AND WHAT THE FIELD ACTUALLY DOES
  ===========================================================================

  1 · VIRTUAL FOCUS, NOT ROVING TABINDEX. DOM focus never leaves the input; the
      "focused" option is named by `aria-activedescendant`. This is not a preference —
      ARIA 1.2 makes it a normative MUST for autocompleting comboboxes ("DOM focus
      remains on the text input while the suggestions are displayed"), and the
      mechanical reason is that the listbox is a SIBLING of the input, not a
      descendant. `aria-activedescendant` normally requires the active element to be a
      descendant of the focused one; APG carves out an exception for exactly
      `combobox`/`textbox`/`searchbox` referencing via `aria-controls`. A roving
      tabindex would mean moving DOM focus into the list, which breaks text editing.

      WHAT THAT COSTS US: the browser scrolls for a roving tabindex and does NOT scroll
      for activedescendant. APG names this as the one advantage we give up, so the
      scrolling is ours to do — see the effect below.

      Ariakit (`virtualFocus: true` by default), Headless UI, Downshift, cmdk, React
      Aria and Carbon all agree. GOV.UK's accessible-autocomplete is the lone dissenter:
      it sets `aria-activedescendant` AND calls `.focus()` on the option, and pays for
      it with printable-key handlers that bounce focus back and Safari mousedown
      workarounds. No comment in its source justifies the choice.

  2 · THE LIVE REGION ANNOUNCES THE COUNT, AND ONLY THE COUNT.

      React Aria injects an off-screen live region with three messages, and the gating
      is the lesson: `focusAnnouncement` and `selectedAnnouncement` fire ONLY on Apple
      devices — they are a workaround for VoiceOver mishandling activedescendant
      changes (WebKit bug 231724) and shipping them ungated makes JAWS and NVDA say
      everything twice. `countAnnouncement` fires everywhere, because it is not a
      workaround at all: `aria-activedescendant` points at ONE option and has no way
      whatsoever to express "your filter just produced six results". No amount of
      correct ARIA closes that gap; a live region is the only mechanism.

      So this ships the count, ungated, and does NOT ship a focus announcement. APG
      itself prescribes neither — that is a React Aria practice, not a spec rule, and
      worth attributing correctly.

  3 · THE LIST IS AN INLINE SIBLING. NOT A PORTAL — and for once this board's hardest
      constraint does not apply.

      `DropDownSelect` keeps the platform's popup because a node card is
      `overflow: hidden` inside a world under `transform: translate(...) scale(z)`, and
      a transformed ancestor becomes the containing block for fixed AND absolute
      descendants, so a portalled popup has to undo an ancestor transform every frame.
      All three consumers here render AFTER `</BoardBoundary>` in App.tsx — they are
      app-level overlay panes, outside the transform entirely. There is nothing to
      escape, so we do not pay for an escape.

      The field is genuinely split on this and there is no consensus to defer to:
      React Aria, Radix and Polaris always portal; Ariakit defaults `portal: false`;
      Headless UI portals only when you pass `anchor`; Carbon never portals; Downshift
      and cmdk do no positioning at all. Floating UI's own docs concede portalling
      "remains the only fully reliable method" for escaping clipping — which is the
      problem we do not have. Staying inline keeps DOM proximity, event bubbling, CSS
      inheritance and focus order, and means we never need React Aria's
      `ariaHideOutside([input, popover])` dance to stop a screen reader wandering the
      page behind an escaped popup.

      A combobox INSIDE a node card on the canvas is a different component and is not
      this one. It would need the portal, the transform correction, and per-frame
      position tracking (`autoUpdate({animationFrame: true})`, since a transform fires
      no scroll, resize or layout-shift observer). Nothing asks for that today.

  4 · THE CALLER FILTERS. `options` arrives already filtered.

      The three consumers it was distilled from each owned their filtering and each
      did it differently — one grouped by scale, one applied provider-layer and type
      guards, one scored across five kinds. A component that filtered again would have
      been wrong for all three, and stays wrong for any caller with server-side or
      domain-specific filtering. React Aria encodes exactly this split and it is the single
      most common bug with their hook: pass `defaultItems` and it filters, pass `items`
      and `defaultFilter` is SILENTLY IGNORED, because a server-filtered list must not
      be double-filtered. We only have the controlled case, so we do not pretend to
      offer the other.

      (Worth stealing if this ever does own filtering: React Aria's `useFilter` uses
      `Intl.Collator` with `usage: 'search'` and `.normalize('NFC')`, comparing with a
      sliding window of `collator.compare(...) === 0` rather than `String.includes` —
      which is what makes `sensitivity: 'base'` match "resume" against "résumé".)

  5 · OPTIONS ARE RENDERED BY THE CALLER, and this is the deepest difference from
      `DropDownSelect`. That component flattens a hint into the option TEXT
      (`Medium · 12px`) because a native `<select>`'s open list cannot be styled at
      all. Here the list is ours, and all three consumers need rich rows — swatches,
      a leaf key beside a full token path, a "now" marker, `+N more` footers. So
      `renderOption` takes the item and its state and returns whatever it likes.

  ===========================================================================
  WHAT WE DID NOT USE: <datalist>
  ===========================================================================
  It is the native answer and it is disqualified several times over. The popup is UA
  chrome, so no token, radius, focus ring or dark theme reaches it. Its font does not
  zoom (MDN: "always remaining the same size") — a WCAG 1.4.4 exposure with no
  remedy. VoiceOver + Safari support it not at all, and "conveying changes in the
  number of suggestions" — precisely what filtering IS — passes on almost nothing.
  The spec declines to define the filtering algorithm and explicitly blesses capping
  the list at "four to seven values". And it cannot separate a displayed label from a
  committed value: the visible input IS the value, so a row showing "Germany" that
  commits `DE` would replace the user's text with `DE` on pick. Every consumer here
  needs {key, label, rich content} triples.

  ===========================================================================
  THE KEYBOARD CONTRACT (APG), AND THE TWO PLACES WE DIVERGE ON PURPOSE
  ===========================================================================
  Down        open, move to next option (first, if none active)
  Up          open, move to previous (last, if none active)
  Alt+Down    open WITHOUT moving the active option
  Alt+Up      close, keep focus in the field
  Enter       pick the active option
  Escape      close the list — see below
  Home/End    NOT intercepted. For an EDITABLE combobox APG puts the caret at the
              start/end of the TEXT; only a select-only combobox jumps to the first or
              last option. Hijacking these is a common and invisible bug.
  printable,  never intercepted, never close the list. APG is emphatic: "Ensure
  Left/Right, JavaScript does not interfere with browser-provided text editing
  Backspace,  functions by capturing key events for the keys used to perform them."
  Delete

  DIVERGENCE 1 — ESCAPE DOES NOT CLEAR THE FIELD. APG makes a second Escape clearing
  the text OPTIONAL, and both its editable examples implement it. We do not, and
  deliberately: the natural home of a combobox is inside a sheet or dialog that owns
  Escape ("close the palette", "revert the draft"). So Escape closes the list and stops there
  — and only swallows the event WHEN THE LIST WAS ACTUALLY OPEN, letting it bubble
  otherwise so the surrounding surface still closes. Clearing the field would silently
  eat the user's second Escape and strand them inside a sheet.

  DIVERGENCE 2 — ARROW KEYS WRAP AT THE ENDS. The APG prose says that at the boundary
  you either return to the combobox or do nothing; both of APG's own reference examples
  wrap instead. We follow the examples, because a filtered list of five is usually
  scanned in a loop rather than walked once.
*/
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react'
import { CaretIcon, DismissIcon } from './Icon'
import { Button } from './Button'
import { FIELD_CHROME_SIZE } from './TextField'
import type { TextFieldSize } from './TextField'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { fieldLevel, useLevel } from './LevelContext'

/*
  THREE RUNGS, matching Button and DropDownSelect exactly — same spacing steps, same
  type levels (microcopy · body-s · body-m). Two controls that sit in the same row must
  agree, and the only way that agreement stays true is if neither owns the number.
  TextField still has two; it is the odd one out and should follow.
*/
/*
  AN ALIAS OF `TextFieldSize`, not a second 'small' | 'large'. The four fields are ONE
  ladder — 50 / 56, measured — and two identical literals are two types to the compiler, free to
  drift apart silently. TextField is the canonical namer, as Button is for the inline rungs.
*/
export type ComboboxSize = TextFieldSize
/** the same two placements DropDownSelect and TextField carry, and the same rule:
    `hidden` is the accessible name only, for a field in an already-labelled pane. */

type ComboboxBase<T> = {
  /** the accessible name — REQUIRED, and it names the LISTBOX as well as the field.
      APG's examples label the list ("States"); an unnamed list is announced as a bare
      "list box" with no clue what it holds. */
  label: string
  /** the query text. Controlled, like every other field in this kit. */
  value: string
  onChange: (value: string) => void
  /** ALREADY FILTERED — see decision 4 in the file header. */
  options: T[]
  /** stable identity, and also the `id` an option is referenced by from
      `aria-activedescendant`, so it must be unique within the list */
  getKey: (option: T) => string
  /** the pick. Enter on the active option, or a click. */
  onPick: (option: T) => void
  /** the row. `active` is the virtually-focused one — style it, because with virtual
      focus there is no real `:focus` on it to hang a style from. */
  renderOption: (option: T, state: { active: boolean }) => ReactNode
  /** consecutive options sharing a group get one `role="group"` with this as its
      label — a values-by-scale sheet was the consumer this was built for */
  groupOf?: (option: T) => string | undefined
  /** the group's visible heading, when a bare string will not do — a heading carrying
      a name, a collection and a count is the shape this was built for. The string
      `groupOf` returned is still what `aria-label` announces, so the rich version
      never has to be parseable. */
  renderGroup?: (group: string, count: number) => ReactNode
  /** shown in place of the list when `options` is empty */
  emptyMessage?: ReactNode
  /** below the list, inside the same surface — the "+N more, narrow the filter"
      slot. Not an option, never focusable, never announced as one. */
  footer?: ReactNode
  placeholder?: string
  /** declared, never inferred from `placeholder` — see TextField's note on this prop */
  required?: boolean
  size?: ComboboxSize
  /** a second, quieter value at the far end — the same slot every field in the kit
      carries, and the shape DropDownSelect shows beside a chosen option (`bold` · `700`).
      Part of the VALUE, so it rides the value's line and the pointer passes through it.
      TWELVE CHARACTERS AT MOST, by TextField's rule and for the identical geometry:
      `.nd-combobox-hint` is `flex: none` too, so it takes its width off the value rather
      than giving way. See TextField's note on this prop for the measurements. */
  hint?: ReactNode
  /** a leading slot, same contract as DropDownSelect's and TextField's */
  icon?: ReactNode
  block?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
  autoFocus?: boolean
  disabled?: boolean
  /*
    THE LIST IS THE PANE'S CONTENT, NOT A POPUP OVER IT.

    All three consumers render their list unconditionally — it is the body of a sheet
    or a panel, visible whether or not the field has focus. `aria-expanded` is
    therefore permanently true, which is correct and is what cmdk does for the same
    reason (a command palette's list is the palette).

    Left off, the component behaves as a conventional combobox: the list opens on
    focus or on typing and closes on blur, Escape or Alt+Up.
  */
  persistent?: boolean
  /*
    WHERE THE LABEL GOES — identical in behaviour to TextField's, and for the identical
    reason: this control is TYPED INTO, so the label lifts on a value OR on focus.
    DropDownSelect only ever needed "is something chosen", because choosing is atomic
    and there is no moment where the field is empty but about to be filled. Here there
    is, and the label must be out of the way before the first keystroke rather than
    yanked aside by it.

    All three of this board's consumers pass `hidden`: each sits in a pane that already
    names the field. `floating` is for a combobox standing on its own.
  */
  /*
    THE SCROLLER, HANDED BACK. The component scrolls the ACTIVE option into view, which
    is its own business — but a caller can have a different row it needs kept visible,
    and that logic belongs where the domain knowledge is. The consumer this was built
    for centred the currently-bound value on open and kept it clear of a sticky group
    header; neither rule generalises, so the caller keeps rules like those and this
    hands back the element to apply them to.
    React Aria exposes `listBoxRef` for the same reason.
  */
  listRef?: RefObject<HTMLDivElement>
}

/*
  AN ERROR MUST BE SAYABLE — the same union DropDownSelect and TextField both carry,
  for the same reason: `invalid` alone reports THAT something is wrong, and WCAG 3.3.1
  asks for the reason in text. The type refuses the half that helps nobody.
*/
type ComboboxValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type ComboboxProps<T> = ComboboxBase<T> & ComboboxValidity

export function Combobox<T>({
  label,
  value,
  onChange,
  options,
  getKey,
  onPick,
  renderOption,
  groupOf,
  renderGroup,
  emptyMessage,
  footer,
  placeholder,
  required = false,
  size = 'small',
  hint,
  icon,
  block = false,
  autoFocus = false,
  disabled = false,
  persistent = false,
  listRef: listRefProp,
  invalid = false,
  describedBy,
  style,
}: ComboboxProps<T>) {
  const uid = useId()
  const inputId = `${uid}-input`
  const listId = `${uid}-list`
  const optionId = (key: string) => `${uid}-opt-${key}`

  /*
    ONE STATE FOR OPENNESS, not two derived ones. This began as `focused && !dismissed`,
    which read tidily and had a real flaw: the toggle button could not open the list on
    its own. It focused the input and then waited for the focus EVENT to flip `focused`
    — so anything that moved focus without firing one (and, it turns out, any context
    where the document itself is not focused) left the button pressing on a state it did
    not own. A control's own affordance must not depend on a side effect to work.
  */
  const [openState, setOpenState] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const ownListRef = useRef<HTMLDivElement>(null!)
  const listRef = listRefProp ?? ownListRef

  /*
    OPEN IF THERE IS ANYTHING TO SHOW, and an empty-state message counts. A toggle that
    refuses to open because the filter matched nothing looks broken — the user pressed
    it and the control did not respond. "No values match" IS a response.
  */
  const open = persistent || (openState && (options.length > 0 || emptyMessage != null))
  const keys = useMemo(() => options.map(getKey), [options, getKey])
  const activeIndex = activeKey === null ? -1 : keys.indexOf(activeKey)

  /*
    THE ACTIVE OPTION IS TRACKED BY KEY, NOT BY INDEX, and that is the whole reason
    this list is derived rather than stored. The options are re-filtered on every
    keystroke: index 2 before the keystroke and index 2 after it are different rows,
    so an index would silently retarget the active option — and Enter would pick
    something the user never saw highlighted. A key that has filtered away resolves to
    -1 here and the effect below stands the reference down.
  */
  useEffect(() => {
    if (activeKey !== null && !keys.includes(activeKey)) setActiveKey(null)
  }, [keys, activeKey])

  /*
    WE SCROLL, BECAUSE VIRTUAL FOCUS MEANS THE BROWSER WILL NOT. This is the cost APG
    names for choosing `aria-activedescendant` over a roving tabindex: nothing is
    really focused, so nothing is really scrolled into view. `block: 'nearest'` rather
    than the default `'start'` — the default jumps the list on every arrow press even
    when the option is already comfortably visible.
  */
  useEffect(() => {
    if (!open || activeKey === null) return
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeKey))}`)
    el?.scrollIntoView({ block: 'nearest' })
    // optionId is derived from uid, which is stable for the component's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, open])

  /*
    THE COUNT, ANNOUNCED — see decision 2. Deliberately derived from the rendered
    state rather than pushed from the change handler, so it also fires when the CALLER
    re-filters for a reason of its own (a scheme switch, an async load) rather than
    only when a key was pressed.
  */
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (!open) return setAnnouncement('')
    const n = options.length
    setAnnouncement(`${n} ${n === 1 ? 'option' : 'options'} available.`)
  }, [options.length, open])

  const move = (delta: number) => {
    if (!options.length) return
    const from = activeIndex
    // wraps at both ends — divergence 2 in the file header
    const next = from === -1 ? (delta > 0 ? 0 : options.length - 1) : (from + delta + options.length) % options.length
    setActiveKey(keys[next] ?? null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpenState(true)
      if (e.altKey) return // Alt+Down opens WITHOUT moving the active option
      move(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (e.altKey) {
        setOpenState(false)
        setActiveKey(null)
        return
      }
      setOpenState(true)
      move(-1)
      return
    }
    if (e.key === 'Enter') {
      if (open && activeIndex >= 0) {
        e.preventDefault()
        onPick(options[activeIndex] as T)
      }
      return
    }
    if (e.key === 'Escape') {
      /*
        ONLY SWALLOW IT IF THERE WAS A LIST TO CLOSE — divergence 1. Every consumer
        sits inside a sheet or dialog that owns Escape, so an unconditional
        stopPropagation here would strand the user inside it.
      */
      if (open && !persistent) {
        e.preventDefault()
        e.stopPropagation()
        setOpenState(false)
        setActiveKey(null)
      }
      return
    }
    /*
      EVERY OTHER KEY IS THE BROWSER'S. Home and End move the caret in an editable
      combobox (only a select-only one jumps to first/last option); printable
      characters, Left, Right, Backspace and Delete all edit text and must not close
      the list. Intercepting any of them is the failure APG puts in capitals.
    */
  }

/*
  THE LABEL ALWAYS FLOATS — there is no `labelPlacement` any more.

  It had two values and `hidden` was the default, on the argument that the board's fields
  sit in panes whose headings already name them. That is still true of those panes, but a
  field that only carries its name for assistive tech is a field whose name is invisible
  the moment it is reused anywhere else — and a placement prop is a decision every call
  site has to get right. One label, always drawn, is the thing that cannot be got wrong.

  The cost is real and was measured before the change: every field is two lines now, so
  the board's fields went from 32 / 38 to 50 / 56.
*/

  /*
    THE TOGGLE, per APG: `role="button"`, focusable but OUT OF THE TAB SEQUENCE
    (`tabindex="-1"`), and not a descendant of the combobox element — the input carries
    `role="combobox"`, and a `<button>` cannot live inside an `<input>`, so the last one
    is structural here. Tab reaches the field and nothing else; the button is a pointer
    affordance, and a keyboard user already has Alt+Down.

    IT MUST NOT TAKE FOCUS. `preventDefault` on pointerdown stops the mousedown from
    blurring the input — without it the field blurs, `open` goes false, and the click
    lands on a list that has already unmounted. Downshift does exactly this, for exactly
    this reason. Focus is then put back explicitly, so the caret is where the user can
    keep typing.

    NOT RENDERED WHEN `persistent`. A control that toggles something permanently open is
    a lie about what pressing it does, and the three board consumers are all persistent.
  */
  /*
    CLEAR — and it renders only when there is something to clear. A permanently visible
    × on an empty field is a control that does nothing, which is the "dead half" this
    kit refuses elsewhere; but its SPACE is reserved permanently (see the padding rule
    in node.css), so the caret does not jump sideways the moment you type a character.

    `tabindex="-1"`, like the toggle and for the same APG reason: Tab reaches the field
    and nothing else. A keyboard user is not stranded — the text is selectable and
    deletable, which is the route they would reach for first anyway.

    It clears the QUERY and the active option, and deliberately does not close the list:
    an empty query filters to everything, so the list going from three matches to all of
    them is the honest result of what the button did.
  */
  const clear = () => {
    if (disabled) return
    onChange('')
    setActiveKey(null)
    inputRef.current?.focus()
  }

  const toggle = () => {
    if (disabled) return
    setOpenState(!open)
    if (open) setActiveKey(null)
    inputRef.current?.focus()
  }

  const wrapClass = [
    'nd-combobox',
    `s-${size}`,
    block ? 'is-block' : '',
    persistent ? 'is-persistent' : '',
    disabled ? 'is-disabled' : '',
    invalid ? 'is-invalid' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /* consecutive runs sharing a group label */
  const runs = useMemo(() => {
    const out: { group?: string; items: { option: T; key: string }[] }[] = []
    options.forEach((option, i) => {
      const key = keys[i] as string
      const group = groupOf?.(option)
      const last = out[out.length - 1]
      if (last && last.group === group) last.items.push({ option, key })
      else out.push({ group, items: [{ option, key }] })
    })
    return out
  }, [options, keys, groupOf])

  const renderRow = ({ option, key }: { option: T; key: string }) => {
    const active = key === activeKey
    return (
      <div
        key={key}
        id={optionId(key)}
        role="option"
        /*
          aria-selected ONLY ON THE ACTIVE ONE. Stamping `false` on every other option
          makes a screen reader say "not selected" on every single arrow press. In a
          listbox combobox selection follows focus, so the active option is the
          selected one and the rest carry nothing.
        */
        {...(active ? { 'aria-selected': true } : null)}
        className={`nd-combobox-option${active ? ' is-active' : ''}`}
        /*
          POINTER DOWN IS PREVENTED SO FOCUS NEVER LEAVES THE FIELD. Without this the
          mousedown blurs the input, `open` goes false, and the list unmounts before
          the click can land — the classic "clicking an option does nothing" bug.
          Downshift does exactly this, with the same reasoning in its source.
        */
        onPointerDown={(e) => e.preventDefault()}
        onPointerEnter={() => setActiveKey(key)}
        onClick={() => onPick(option)}
      >
        {renderOption(option, { active })}
      </div>
    )
  }

  return (
    <div className={wrapClass} data-scheme={invalid ? 'error' : undefined} style={style}>
      <div
        className="nd-combobox-field"
        /* one rung off its ground — the step LevelContext computes, since CSS cannot. Without
           it `--nd-field-fill` is undeclared and this field paints no fill at all. */
        data-fill={fieldLevel(useLevel())}
      >
        {icon && (
          <span className="nd-combobox-leadbox" aria-hidden>
            {icon}
          </span>
        )}
        {(
          /*
            A REAL <label>, and `aria-label` is dropped the moment it renders — the
            same trade DropDownSelect and TextField both make. A visible label must BE
            the accessible name rather than sit beside one, or the control is announced
            by text nobody can read, which breaks voice control (WCAG 2.5.3) in exactly
            the case where someone is reading the name off the screen to say it.

            The LISTBOX still needs the string, so `label` goes on that regardless —
            see `aria-label` on the list below.
          */
          <label className="nd-combobox-float" htmlFor={inputId}>
            {label}
          </label>
        )}
        <input
          ref={inputRef}
          id={inputId}
          className="nd-combobox-input"
          type="text"
          role="combobox"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-expanded={open}
          /* APG: only needs to be set while the popup is visible */
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeKey !== null ? optionId(activeKey) : undefined}
          /*
            `list`, not `both`: we filter the list but never inject a completion string
            into the field. `both` carries extra normative duties (render the completion
            as selected text) that we do not perform, and declaring it without doing it
            is worse than declaring the truth. `aria-haspopup` is omitted on purpose —
            its implicit value for role=combobox is already `listbox`.
          */
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          onChange={(e) => {
            setOpenState(true)
            onChange(e.target.value)
          }}
          onFocus={() => setOpenState(true)}
          onBlur={() => {
            setOpenState(false)
            setActiveKey(null)
          }}
          onKeyDown={onKeyDown}
          // a press inside a control must never start a node drag
          onPointerDown={(e) => e.stopPropagation()}
        />
        {/* in flow between the value and the controls, so a long hint shortens the value
            rather than being overrun by it — see TextField's note */}
        {hint != null && <span className="nd-combobox-hint">{hint}</span>}
        {value !== '' && (
          /*
            THE KIT'S BUTTON, not a hand-rolled one — `ghost` + `square` IS an icon
            button, and re-declaring `padding: 0; border: 0; background: none` beside a
            component that already means exactly that is how two things drift. The
            hand-rolled pair had already lost Button's focus ring, which is the cost of
            duplication showing up within a day of writing it.

            The handlers ride through Button's rest-spread. It takes no `className` by
            design, which is why this used to look impossible — the answer was not to
            force one but to stop positioning these absolutely: the field is a flex row
            now, so the layout is the row's job and the button needs no class at all.

            THE × IS IN THE TAB SEQUENCE AND THE CARET IS NOT, and the two are not
            inconsistent — they are different kinds of control.

            APG is explicit that a combobox's popup button stays out of the tab order:
            it duplicates what Alt+Down and typing already do from the field, so putting
            it in the sequence buys a stop that leads nowhere new. Clearing is not like
            that. It is its own destructive action, and the only other keyboard route to
            it is select-all-then-delete — a thing you have to know rather than a thing
            you can find. A control that exists on screen and can only be reached with
            a mouse is the plainest form of keyboard trap-by-omission.

            `onPointerDown`'s preventDefault still stops a MOUSE press from taking focus
            off the field, which is what a pointer user wants; it does nothing to Tab.
            Clearing then returns focus to the input — required, not merely polite: the
            × unmounts the moment the value is gone, and focus on a removed element
            falls to `<body>`.
          */
          <Button
            variant="ghost"
            kind="icon-button"
            /* the family rule, stated once at its home — see FIELD_CHROME_SIZE in TextField.tsx:
               the box is pinned to 24 at both rungs, and a control that only has to be hittable
               has no reason to grow with the box around it */
            size={FIELD_CHROME_SIZE}
            glass={false}
            label="Clear"
            leading={<DismissIcon />}
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={clear}
          />
        )}
        {/* the rule between them, and only when there ARE two things to separate */}
        {value !== '' && !persistent && <span className="nd-combobox-divider" aria-hidden />}
        {!persistent && (
          <Button
            variant="ghost"
            kind="icon-button"
            /* the family rule, stated once at its home — see FIELD_CHROME_SIZE in TextField.tsx:
               the box is pinned to 24 at both rungs, and a control that only has to be hittable
               has no reason to grow with the box around it */
            size={FIELD_CHROME_SIZE}
            glass={false}
            label={open ? 'Hide suggestions' : 'Show suggestions'}
            leading={<CaretIcon />}
            tabIndex={-1}
            disabled={disabled}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={toggle}
          />
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          /* the list carries the field's name too — an unnamed listbox announces as
             a bare "list box" with no indication of what it holds */
          aria-label={label}
          className="nd-combobox-list"
          /* a flyout is a REGION that floats, so it is a level island at the top rung —
             its own ground, and the accent that belongs to it (tokens.css, THE FILL AXIS) */
          data-level={4}
        >
          {options.length === 0
            ? emptyMessage != null && (
                /* not an option, and not inside the option flow: a row announced as
                   `option` that cannot be picked is worse than silence */
                <div className="nd-combobox-empty" role="presentation">
                  {emptyMessage}
                </div>
              )
            : runs.map((run, i) =>
                run.group == null ? (
                  run.items.map(renderRow)
                ) : (
                  <div key={`${run.group}-${i}`} role="group" aria-label={run.group} className="nd-combobox-group">
                    <div className="nd-combobox-grouphead" role="presentation">
                      {renderGroup ? renderGroup(run.group, run.items.length) : run.group}
                    </div>
                    {run.items.map(renderRow)}
                  </div>
                )
              )}
          {footer != null && (
            <div className="nd-combobox-footer" role="presentation">
              {footer}
            </div>
          )}
        </div>
      )}

      {/*
        THE COUNT LIVE REGION — decision 2. `aria-live="polite"` rather than a
        `role="status"` element so it never competes with the option announcement that
        activedescendant already produces; it waits its turn instead.
      */}
      <div className="nd-combobox-announce" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  )
}
