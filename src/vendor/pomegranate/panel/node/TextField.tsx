/*
  TextField — every text field on the board, and nothing else.

  THE NAME AND THE SCOPE. This was `NodeInput`, in a file that also exported the
  colour chip. "Input" is the HTML element's name, not the component's: a native
  `<input>` is also a checkbox, a radio, a range, a colour — so the name claimed a
  whole family while the component only ever answered for one member of it.
  `TextField` is what it is, and what the rest of the industry calls it. The chip
  moved to `Swatch.tsx`, which makes its own case in its own header; what is left
  here is a single component about a single thing.

  THE DECISION THAT SHAPES IT. The board had nine text fields under five class
  names — fs-name, fs-text, fs-area, panel-text, vs-search — and every one of
  them was a slightly different answer to the same question. This is the one
  answer, and two things about it are deliberate.

  ONE. THE FACE IS THE FOUNDATION'S, AND THE COMPONENT DOES NOT CHOOSE IT. Both
  the label and the value are set in GT Ultra, reached through their text styles.

  This file used to set `--mono` here and argue for it at length: every text a
  user types into this tool is an IDENTIFIER — a token path, a facet name, a
  six-digit hex — and in a proportional face `#E2492F` and `#E2492E` are the same
  shape, `l` and `1` are the same shape, and two token paths that differ in the
  middle do not visibly differ at all.

  The argument still stands. The token did not: `--mono` is not in the foundation.
  It is a hard-coded string in `generate-css.mjs` carrying the marketing site's
  Fragment Mono, while the foundation's own family collection is `sans` / `median`
  / `display`, three GT Ultra cuts and no monospace. And `font-family` here is a
  MODE, not a per-component choice — which is exactly why the foundation carries
  `body-m` once instead of one copy per face.

  So a component may not answer this question, and this one no longer tries. If
  the identifier face is wanted, it is a fourth entry in `core-typography.family`
  with a mode beside it, and then every text style gets it at once. Until then
  there is one family, and both kinds of text are set in it.

  Spell-check follows from the same fact and is likewise not a prop: what this
  holds is always an identifier, so it is off — a red squiggle under a token path
  is noise that teaches you to ignore red squiggles. Autocorrect and
  auto-capitalization go with it: Safari applies both to plain inputs even on
  desktop, and `primary-button` must not arrive as `Primary-button`. A fixed
  identifier is a different identifier.

  TWO. ONE LINE, AND SO NO `multiline` PROP. It used to take one, and the boolean
  made this component answer two different questions: a text field holds ONE line
  that SCROLLS when the value outruns the box, and a text area holds a paragraph
  that WRAPS. Nearly every decision below forks on that — whether spell-check is
  on, what Enter means, whether the box can be resized, what its height is at all —
  so it was not an option on one component, it was two components sharing a file
  and a props table. Prose moved to `TextArea.tsx`; the line that scrolls is here.

  THREE. THERE IS ONE VARIANT, AND SO THERE IS NO `variant` PROP. There used to be
  a `bare` — a sheet heading that happened to be editable, with no border and its
  own 15px face — and it was a second component wearing this one's props. It could
  not carry a floating label (it had no box to hang one inside), which is why the
  label code had to special-case it; it ignored `size` except for the padding; and
  it existed for exactly one call site. A field that is really a heading should be
  built as a heading. What is left is the box, and a component with one shape does
  not need a prop to say which shape it is.

  ON stopPropagation. A pointer press stops here, for the same reason it stops in
  DropDownSelect: a press inside a control must never start a node drag. A KEY
  press does NOT stop here, and that is the considered choice rather than an
  omission. A host app's global handlers are expected to ignore any event whose
  target is an INPUT or TEXTAREA (the board app's did, which is how this was
  measured) — the one site that called stopPropagation was doing nothing that
  guard was not already doing. Swallowing keys at the component would make that guard
  untestable, and would silently eat any deliberate global shortcut (⌘K,
  Escape-to-close) that a field ought to let through. The guard is the right
  place; this is not.

  WHAT THIS REBUILD ADDED, following DropDownSelect's lead exactly where the two
  controls face the same problem, and diverging where they do not:

  · `disabled` — a REAL GAP, not a refinement. The field had no disabled state at
    all: no attribute, no class, no way to render one. Added on the disabled
    token rung (`--background-disabled`/`--stroke-disabled`/`--text-disabled`),
    the same shape DropDownSelect already uses and the same one node.css's own
    comment names as the reference the rest of the kit should follow.
  · `readOnly` — and here the two controls genuinely differ. `<select>` has no
    native readonly, which is why DropDownSelect fakes one with a one-option
    list. `<input>`/`<textarea>` DO have a real `readonly` attribute — the
    platform already guarantees "focusable, announced, not editable" — so this
    is a straight pass-through, styled on the same disabled surface with full
    text contrast, and nothing needs faking.
  · the FLOATING LABEL, adapted to a control that can be typed into. It lifts on
    a value OR on focus, because a field you are about to type into should show
    you where the label went before you have typed the first character —
    DropDownSelect never needed this, since choosing a value is atomic and there
    is no "typing" moment to design for. It is not a prop: see the render body.
  · `icon` — the same leading slot, centred on the value row, exactly as
    DropDownSelect's is.
  · `maxLength` — the limit, and the counter that makes it survivable. One prop,
    because a limit with no counter is a trap and a counter with no limit is trivia;
    see the prop's note.
  · `hint` — a second, quieter value at the far end, on the value's own line. The shape
    DropDownSelect has always had; the others could not carry one until the box moved from
    the control to the wrapper, because a hint has to sit inside the border and beside the
    value, and the control WAS the border.
  · `trailing` — the slot at the OTHER end, and the one place this component takes
    arbitrary children. See the prop's note for why one slot can honestly hold both
    a decorative mark and a real icon button when the leading one cannot.
  · `invalid` cannot be passed without `describedBy` — the same union, closing
    the same WCAG 3.3.1 gap: a border that changes colour is not "the error
    identified in text."
  · THE HOVER REVEAL — a value longer than the box scrolls to its END on hover,
    and back on leave, at a constant reading speed. See the note on the handler for
    why the field needs one and why the tween is the kit's rather than the UA's.
*/
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { useId, useRef } from 'react'

/*
  THREE RUNGS, matching Button, DropDownSelect and Combobox. It carried only two, so a
  field asked for `large` silently rendered `small` — the size prop failing closed
  rather than loudly, which is how a row of controls ends up with one member 10px
  shorter than the rest and nobody able to say why.
*/
export type TextFieldSize = 'small' | 'large'

/*
  THE FIELD FAMILY'S CHROME IS `small` AT BOTH RUNGS, and this constant is the rule's one home.

  The dependency audit found the rule alive in three places and named in none: a comment on
  Combobox's trailing ✕, a note on `--nd-combobox-ctl`, another on `.nd-select-caretbox` — and
  DateTimeField repeating `size="small"` at seven render sites with no comment at all, agreeing by
  coincidence rather than by reference. The argument, stated once: a control that only has to be
  HITTABLE has no reason to grow with the box around it. 24 is the AA target floor; the trailing
  boxes are pinned to it at both rungs, and passing the FIELD's size instead once rendered a large
  button's 36px of content inside a box pinned to 24. Field components size their nested chrome —
  the ✕, the caret, the picker's own controls — with this name, so the day the rule changes it
  changes everywhere or nowhere. node-kit-test sweeps the family for literals that dodge it.
*/
export const FIELD_CHROME_SIZE = 'small' as const

type TextFieldBase = {
  value: string
  onChange: (value: string) => void
  /** the accessible name. Required, because a field beside a styled <span> is
      not labelled by it — and five of the nine sites this replaced had none. */
  label: string
  /** placement only — margin and grid position belong to the layout that holds
      the field, never to the field. Use tokens.

      The field renders inside a wrapper span (the label and the icon need
      something to be positioned against), and this style lands on THAT wrapper —
      the element a real layout actually wants to position. */
  style?: CSSProperties
  /** stretch to the layout that holds it, instead of sharing a flex row */
  block?: boolean
  placeholder?: string
  /*
    A PLACEHOLDER IS A REQUIRED-NESS CLAIM, AND HERE IT IS ONLY A DRAWN ONE.

    DropDownSelect states the doctrine and backs it: "Choose a radius…" tells a sighted
    reader the field is unfilled and must be filled, so it announces `aria-required` too.
    It can INFER it, because there the inference is exact — the placeholder option is
    disabled and unmounts on first selection, so there is no route back to empty, and a
    field you cannot empty is a field you must fill.

    A TYPED field has no such guarantee. `e.g. Naxos` is a worked example and `Search…`
    is an invitation; neither says the field is mandatory, and inferring required-ness
    from the presence of a placeholder would mark every hint-bearing optional field as
    required — a worse lie than the silence it replaced. So this one is DECLARED.

    What it is not is the native `required`. Same reason DropDownSelect gives: nothing on
    this board submits a form, and the attribute would invite the browser's own validation
    bubble, which the board has nowhere to draw and no way to style. `aria-required` states
    the fact and leaves the drawing to the component.

    It draws nothing on purpose. Required-ness has no mark in this kit — DropDownSelect
    announces without one — and adding an asterisk here and nowhere else would be the same
    divergence this prop exists to close. When the foundation names a marker, this is the
    single place it goes.
  */
  required?: boolean
  size?: TextFieldSize
  disabled?: boolean
  /*
    SETTLED, NOT UNAVAILABLE — the same distinction DropDownSelect draws, and
    here the platform enforces it directly: a native `readonly` field is still
    focusable and announced, it just cannot be typed into. Styled on the same
    surface as `disabled` (one shape for "you cannot act on this"), with full
    text contrast rather than the disabled dim — the value is the point.
  */
  readOnly?: boolean
  autoFocus?: boolean
  /** for a key the commit contract does not cover — runs FIRST, and a
      preventDefault stands the contract down for that key. Not for
      suppressing the board; see the note above. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** the field COMMITS: Enter. What committing MEANS
      belongs to the sheet, which says so by passing this — what lives here is
      the mechanics every hand-rolled version got subtly different: which key,
      and the IME guard. */
  onCommit?: (value: string) => void
  /** the field REVERTS: Escape. A commit/revert pair the board app's sheets
      hand-rolled four different ways before it lived here. */
  onRevert?: () => void
  /** a leading slot — any node, centred on the value row. Mirrors
      DropDownSelect's `icon` exactly. */
  icon?: ReactNode
  /*
    CURRENCY IS A LEADING ICON, NEVER A CHARACTER IN THE LABEL. When a field holds an
    amount of money, the unit — €, $, £, ¥ — goes in this slot as a named catalogue
    glyph (`<EuroIcon />`, `<DollarIcon />`, `<PoundIcon />`, `<YenIcon />` from
    Icon.tsx), and NOWHERE else. It does not go in the floating label as a glyph
    ("Amount €"), and it does not get typed into the `value`. A named component rather
    than an inline `<Icon name="…" />` because that is the kit's standing rule for every
    glyph — the same idea is the same drawing everywhere, checkable by reading imports.

    Three reasons it is the icon slot and not the label:

    · A UNIT IS NOT A NAME. The label answers "what is this field?" — Amount, Price,
      Budget — and it is the field's accessible name (WCAG 2.5.3, Label in Name). A
      currency glyph welded onto it makes the announced name "Amount euro sign", which
      is a worse name than the one it replaces. The unit is chrome the value carries,
      the way the leading slot fronts every other field; it sits where the value's
      first character would be, so `€ 1,200` reads as one figure with the eye, while
      the label stays the clean name a screen reader reads.

    · A GLYPH IN A STRING DODGES THE FONT AND THE CATALOGUE. A typed € is a text
      character set in GT Ultra at the label's own weight, off the 24px icon grid and
      unable to sit on the value row; the catalogue icon inherits its row's colour
      through stroke (Icon.tsx), repaints for every scheme and dark mode for free, and
      is `aria-hidden` by the set's identity — so the unit never announces as a second,
      worse label. A hand-typed sign is a typo the type system cannot catch; the glyph
      is a bound `IconName` (`euro`/`dollar`/`pound`/`yen`), so a wrong currency is a
      compile error.

    · THE VALUE STAYS THE NUMBER. Everything this field does to a value — the identifier
      contract, the hover-reveal of a tail too long for the box, `maxLength` — is about
      a string you can compare and edit. A `value` of `€1,200` is a number with a
      character wedged in front of it that every consumer then has to strip.

    AND THE AMOUNT ITSELF IS NOT THIS FIELD'S TO UNDERSTAND. `value` is a string, and a
    string reading `8,5` in one place and `8.5` in another is the same amount typed on two
    keyboards. Three rules follow, and all three are the CALLER'S — stated here because
    this slot is where money enters the kit:

    · TYPE EITHER. A European numpad gives a comma, an English one a dot, and with group
      separators refused the two are unambiguous — so a money field accepts both and
      corrects neither WHILE typing. Refusing one of them is refusing a keyboard, and
      rewriting the separator under the caret is worse: it moves the caret.

    · WHAT IS HELD IS MINOR UNITS, NOT THE TEXT — `850`, an integer. `Number('8,5')` is
      `NaN` and `parseFloat('1.200,50')` is `1.2`; both fail silently, and a value that is
      quietly a thousandth of what someone typed is the worst failure this field can be
      part of. Nor is a float the fix once parsed: `0.1 + 0.2` is not `0.3` in binary, so
      a column of amounts drifts by cents that nothing can account for. Sum integers, and
      divide by 100 only to show.

    · THE READING IS `Intl.NumberFormat`'S — `8,50` for a reader in Greece, `8.50` for one
      in the UK, both from the one integer held. A format written by hand is a table of
      locales this repo would then own.

    THIS IS DATETIMEFIELD'S CONTRACT, ONE FIELD OVER, and deliberately in the same words:
    it holds `2028-06-30` and shows `30 Jun 2028` — "converted at the edges and nowhere
    else" (its own note). The kit does not do the money conversion for you, and that is a
    boundary rather than an omission: `TextField`'s value is a string it is not entitled to
    interpret, and a field that guessed at `8,5` would then have to guess at `8.5.5`,
    `8,50 €` and `-8,5`. COMPOSITION-RULES Part C.7 states the general rule; this is its
    money case.

    Enforced by convention today: this note is the rule's home, and `CurrencyLeading` in
    TextField.stories.tsx demonstrates the leading glyph beside the anti-pattern. There is
    no separate `currency` prop, because there is nothing to configure — it is the `icon`
    slot used for the one thing a leading mark on a money field always is.
  */
  /*
    THE TRAILING SLOT, AND WHY IT IS ONE PROP RATHER THAN TWO.

    It holds two different kinds of thing — a DECORATIVE mark (a unit, a format hint,
    a state glyph) or a REAL CONTROL (show/hide, copy, clear) — and those differ in
    the one decision a slot normally has to make for its contents: whether to hide
    them from assistive tech. The leading slot answers it by fiat, wrapping whatever
    it is given in `aria-hidden`, because a mark at the head of a field is decorative
    by definition. That answer cannot be repeated here without making the slot unable
    to hold a button, and asking the CALLER to mark its own content is exactly the
    kind of per-site decision this kit removes.

    It does not have to. Every icon in this set is already `aria-hidden` — Icon.tsx
    makes that the set's identity, not a per-call choice — and every icon BUTTON in
    this kit is required to carry a `label`. So both kinds arrive correctly described
    before this component sees them, and the slot can simply not lie about either: no
    `aria-hidden` on the box, and the pointer reaches a real control and passes
    through a mark.

    BOTH KINDS CENTRE ON THE FIELD. The height belongs to the SLOT rather than to
    whatever is in it, so a mark can be swapped for a button without anything moving,
    and a column of fields keeps its trailing glyphs on one line. The leading glyph is
    the one that still rides the value row — it fronts the value directly, sitting
    where the value's first character would be if it were not there.

    A nested icon button belongs at `size="small"`, which is not a restriction so much
    as the geometry: 24 is the minimum target AND the height of the value row. It also
    passes `glass={false}` — the field is the surface, and a control on someone else's
    surface does not frost. Both are the kit's standing rules for a nested button rather
    than anything this slot invents.
  */
  trailing?: ReactNode
  /*
    A SECOND, QUIETER VALUE AT THE FAR END — what DropDownSelect has always shown beside a
    chosen option (`bold` · `700`): the value names the thing, the hint gives the number
    behind it. It is part of the VALUE, not a control, so it rides the value's line and the
    pointer passes through it.

    It is in flow beside the control rather than positioned over it, so a long hint simply
    shortens the value — nothing has to reserve room for a string whose width cannot be
    known in advance.

    TWELVE CHARACTERS IS THE CAP, and the sentence above is exactly why it needs one. The
    hint is `flex: none` and `nowrap`; the value is `flex: 1 1 auto`. Nothing here
    negotiates — the annotation takes its width first, and every character it spends is a
    character the value loses. Measured on the kit's own 260px specimen (GT Ultra microcopy,
    12px / 0.02em):

      hint                                  chars   its box   the value keeps
      (none)                                    0         —   258
      `700`                                     3        37   221
      twelve of anything                       12     94–97   161–164   ← the cap
      `leave empty if open-ended`              25       171    88
      `per month — this is the rent bill`      33       199    59

    The last two rows are the observed defect rather than invented widths: a rent field and
    a date field annotated with sentences, the date reading `30 Jun 202` with its year cut
    off. TWELVE is the number because it is the last width at which the value still keeps
    the majority of its own box (≈160 of 258), and because it is roomier than every honest
    hint this kit has shown — `700`, `12px`, `400ms`, `16px`, `per month`, `up to 2 MB`.

    WHAT THE COUNT ACTUALLY CATCHES IS A VERB. A hint is a unit or a resolved value; a hint
    that needs a verb has stopped annotating the value and started instructing the person,
    and an instruction inside the box is unannounced, unwrappable, and subtracted from the
    value. That text has a home: on a sheet it is a line of its own under the field, joined
    by `describedBy` — the shape the `Invalid` stories already use for their refusal lines;
    on the board it is `NodeControlRow`'s `hint`, whose `hintId` joins that same
    `describedBy`. Either way it wraps, it is announced, and it costs the value nothing.

    IT IS NOT SOLVED BY LETTING THE HINT ELLIPSISE, which is DropDownSelect's answer one
    component over (`.nd-select-hint` is `flex: 0 999 auto` and truncates — its hint is the
    one that gives way, so the cap is not its rule). It cannot be this one's answer: the
    value has the hover-reveal to read a tail the box cut off and the hint has nothing, so a
    truncated `400…` is a WRONG number where a clipped value is merely a shortened one. The
    annotation stays whole, which means it has to stay short.

    `node-kit-test` §51 counts every literal it can see; a computed hint (`${x}px`) is the
    caller's to keep short.
  */
  hint?: ReactNode
  /*
    THE LIMIT AND THE COUNTER ARE ONE PROP, and that is the whole design decision here.

    They are two halves of one thing. A limit with no counter is a TRAP: typing simply
    stops, with nothing on screen to say why or how much was allowed — the field appears
    to have frozen. A counter with no limit is TRIVIA: "47 characters" answers a question
    nobody asked, because nothing happens at any number. Shipping either alone is
    shipping the half that does not work, so `maxLength` sets the native `maxlength`
    attribute AND draws the counter, and there is no way to ask for one without the other.

    IT SITS OUTSIDE THE FIELD. Inside, it would compete with the value for the width the
    value already does not have, and it would move whenever the trailing slot did. Under
    and right is where a counter has lived since the pattern existed, and the position is
    reserved in the wrapper's MARGIN — outside the border box — so the rim, the label and
    the trailing slot all keep the geometry they were solved for.

    IT IS DESCRIBED, NOT ANNOUNCED. The counter's id joins `aria-describedby`, so a
    screen reader reads the allowance when the field takes focus, which is when it is
    useful. It is deliberately not a live region: announcing "48 of 80, 49 of 80" on
    every keystroke buries the thing the person is actually typing.
  */
  maxLength?: number
}

/*
  AN ERROR MUST BE SAYABLE — the identical constraint DropDownSelect enforces,
  ported here for the identical reason. `invalid` alone reports THAT the value
  is wrong; WCAG 3.3.1 asks for the reason in TEXT, and `describedBy` is the id
  of the element that carries it. The type will not let the useless half ship
  without the honest half.
*/
type TextFieldValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type TextFieldProps = TextFieldBase & TextFieldValidity

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  required = false,
  size = 'small',
  block = false,
  invalid = false,
  describedBy,
  disabled = false,
  readOnly = false,
  autoFocus = false,
  onKeyDown,
  onCommit,
  onRevert,
  icon,
  trailing,
  hint,
  maxLength,
  style,
}: TextFieldProps) {
  /*
    THE LABEL ALWAYS FLOATS — there is no `labelPlacement` any more.

    It had two values and `hidden` was the default, on the argument that the board's
    fields sit in panes whose headings already name them. That is still true of those
    panes, but a field that only carries its name for assistive tech is a field whose
    name is invisible the moment it is reused anywhere else — and a placement prop is a
    decision every call site has to get right. One label, always drawn, is the thing
    that cannot be got wrong.

    The cost is real and was measured before the change: every field is two lines now,
    so the board's fields went from 32 / 38 to 50 / 56. (Written as 56 / 62 when the change
    landed and corrected against the rendered box: the sum below is what the browser draws,
    and `Reference/Fields & buttons in a row` measures it live rather than restating it.)

    It is also why there is no longer an unwrapped shape: a floating label needs a
    box to be positioned inside, so the wrapper is unconditional now.
  */
  const id = useId()

  const fieldClassName = [
    'nd-textfield',
    `s-${size}`,
    invalid ? 'is-invalid' : '',
    disabled ? 'is-disabled' : '',
    readOnly && !disabled ? 'is-readonly' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // a press inside a control must never start a node drag
  const swallowPress = (e: { stopPropagation: () => void }) => e.stopPropagation()

  /*
    THE HOVER REVEAL — a value too long for the box scrolls to its END on hover.

    THE PROBLEM IS SPECIFIC TO THIS COMPONENT. One line that scrolls is what a text
    field IS, and the cost of that choice is that a value wider than its box shows you
    its HEAD and hides its tail, permanently, with nothing to say there is more. The
    values here are token paths and identifiers — `foundation.radius.group.input.all`,
    `#E2492F` — and it is the TAIL that distinguishes two of them. A field that shows
    `foundation.radius.group.…` for both of two different bindings is the same lie the
    identifier face used to prevent, one level up — and no longer can, which is
    the argument for putting a monospace in the foundation.

    An ellipsis would say "there is more" without ever saying WHAT, and it costs a
    character of the little that fits. Reading the value by clicking in and pressing
    End means editing a value you only wanted to read — and on a `disabled` field you
    cannot do even that. Hover asks for nothing and changes nothing.

    IT STANDS DOWN WHILE FOCUSED. Once there is a caret the scroll position belongs to
    the caret: yanking the view to the end while someone is typing mid-value would move
    the text out from under them. Hover is for reading, and reading is what you are
    doing when you are not editing.

    THE TIMING IS THE KIT'S, NOT THE PLATFORM'S — this replaced a `scrollTo` with
    `behavior: 'smooth'`, which was the wrong instrument for two reasons rather than
    one. It was too FAST, which is the reason you can see: smooth-scroll is tuned for
    moving a page to a place you already asked for, where the animation is a courtesy
    on the way to somewhere. Here the animation IS the reading, and the eye has to
    track characters as they pass. It was also UNTUNABLE — the duration is the UA's, it
    differs between engines, and nothing in the foundation could reach it.

    A CONSTANT SPEED, NOT A CONSTANT DURATION. Speed is the honest unit for reading: a
    value twice as long has twice as much to read, and a fixed duration would make
    exactly the longest values — the ones you hovered BECAUSE you could not read them —
    flick past the fastest. The rate is one `--spacing-layout-1` per `--dur-slow`,
    which is 100px a second; both halves are tokens, so the calibration is stated once
    and in the foundation's units rather than as a number chosen here. `--dur-slow` is
    also the floor, so a two-character overflow still reads as a movement.

    AND IT IS LINEAR, which is the one place this kit does not reach for `--ease`. The
    foundation's curves model an object ARRIVING somewhere — they decelerate, and
    `--ease` is far enough into its travel by a third of the way that most of the value
    would pass in the first moment and the tail would crawl. That is right for a panel
    settling into place and wrong for a line of text being read: any easing makes the
    middle of a value pass faster than its ends, and the middle is text too. Ticker and
    marquee motion is linear everywhere for this reason.

    Under `prefers-reduced-motion: reduce` there is no tween at all — the jump is
    instant. That check is direct rather than delegated, which it had to be even before
    this: engines do not agree on whether `behavior: 'smooth'` honours it.
  */
  const control = useRef<HTMLInputElement>(null)
  const tween = useRef(0)

  const revealTail = (toEnd: boolean) => () => {
    const el = control.current
    if (!el || el === el.ownerDocument.activeElement) return
    const over = el.scrollWidth - el.clientWidth
    if (over <= 0) return

    cancelAnimationFrame(tween.current)
    const from = el.scrollLeft
    const span = (toEnd ? over : 0) - from
    if (!span) return

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.scrollLeft = toEnd ? over : 0
      return
    }

    /* the rate, read from the foundation rather than chosen here */
    const px = (name: string) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0
    const per = px('--dur-slow') || 400
    const ms = Math.max(per, (Math.abs(span) / (px('--spacing-layout-1') || 40)) * per)

    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      el.scrollLeft = from + span * t
      if (t < 1) tween.current = requestAnimationFrame(step)
    }
    tween.current = requestAnimationFrame(step)
  }

  /*
    THE COMMIT/REVERT MECHANICS, IN ONE PLACE. "What a key means belongs to the
    sheet, not to the field" — and it still does: the sheet declares the meaning
    by passing onCommit/onRevert. What moved in here is only what should be
    impossible to get wrong: confirming an IME composition fires keydown with
    key === 'Enter' while isComposing is true, and accepting a half-composed
    draft is not a commit (React Aria bakes exactly this guard into its own
    fields, for exactly this reason). The caller's onKeyDown runs first, so a
    sheet can still preventDefault to claim a key for itself. TextArea has no
    equivalent: Enter there belongs to the paragraph.
  */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) onCommit?.(value)
    if (e.key === 'Escape') onRevert?.()
  }

  /*
    THE BACKSTOP, NOT THE RULE. A native `readonly`/`disabled` field already
    stops every user route to a change; this exists for the one route the
    platform does not police — a synthetic event dispatched at the element
    directly (a test harness, a stray extension). Cheap insurance, same shape
    as DropDownSelect's guard on its own onChange.
  */
  const handleChange = (v: string) => {
    if (disabled || readOnly) return
    onChange(v)
  }

  const countId = `${id}-count`
  const counted = maxLength != null

  const commonProps = {
    className: fieldClassName,
    value,
    placeholder,
    disabled,
    readOnly,
    maxLength,
    'aria-invalid': invalid || undefined,
    /* declared, never inferred from `placeholder` — see the prop's note */
    'aria-required': required || undefined,
    /* both descriptions, when there are both — `aria-describedby` takes a LIST, and
       dropping one to make room for the other is how a field ends up announcing its
       allowance and not its error */
    'aria-describedby': [describedBy, counted ? countId : null].filter(Boolean).join(' ') || undefined,
    autoFocus,
    onKeyDown: handleKeyDown,
    onPointerDown: swallowPress,
    id,
  }

  const field = (
    <input
      {...commonProps}
      ref={control}
      type="text"
      spellCheck={false}
      autoComplete="off"
      // the other two thirds of the identifier contract: Safari "fixes" plain
      // inputs even on desktop, and a fixed identifier is a different identifier
      autoCorrect="off"
      autoCapitalize="none"
      onChange={(e) => handleChange(e.target.value)}
    />
  )

  /*
    THE WRAPPER HOLDS THE LABEL AND THE ICON, and nothing else. The real control
    still renders directly, styled directly, with no invisible double the way
    DropDownSelect needs (a `<select>`'s open list cannot be restyled; an
    `<input>` can be styled in place, so nothing here is faked).
  */
  return (
    <span
      /*
        INVALID IS A SCHEME, AND THE ISLAND IS THE WHOLE COMPONENT. An invalid field is the
        SAME field inside `data-scheme="error"`, which repaints accent, stroke and the
        container ladder together rather than borrowing a fixed red.

        It sat on the `<input>` until the box moved up here — a custom property declared on
        an element does apply to that element, which was true while the input WAS the box.
        Afterwards the border was painted by this wrapper, outside the island, and an
        invalid field drew a BLACK outline: measured `#000000` against `#783630`.
      */
      data-scheme={invalid ? 'error' : undefined}
      /* one rung off its ground — the step LevelContext computes, since CSS cannot */
      data-fill={fieldLevel(useLevel())}
      className={[
        'nd-textfield-wrap',
        `s-${size}`,
            block ? 'is-block' : '',
        disabled ? 'is-disabled' : '',
        readOnly && !disabled ? 'is-readonly' : '',
        counted && value.length >= maxLength ? 'is-full' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      /*
        ON THE WRAPPER, NOT THE CONTROL. A `disabled` input is not a hit-test target —
        it fires no pointer events at all — and a bound value you cannot edit is exactly
        the one you most need to read to its end. The wrapper is the element the pointer
        actually reaches in every state.
      */
      onPointerEnter={revealTail(true)}
      onPointerLeave={revealTail(false)}
    >
      {icon && (
        <span className="nd-textfield-leadbox" aria-hidden>
          {icon}
        </span>
      )}
      {/*
        A REAL <label>, exactly as DropDownSelect's — and for the identical reason:
        a visible label must BE the accessible name, not sit beside one (WCAG 2.5.3,
        Label in Name), so this is `htmlFor` rather than an `aria-label` on the field.
      */}
      <label className="nd-textfield-float" htmlFor={id}>
        {label}
      </label>
      {field}
      {hint != null && <span className="nd-textfield-hint">{hint}</span>}
      {trailing && (
        /* NOT `aria-hidden`, and that is the whole argument — see the prop's note */
        <span className="nd-textfield-trailbox">{trailing}</span>
      )}
      {counted && (
        <span className="nd-textfield-count" id={countId}>
          {value.length}/{maxLength}
        </span>
      )}
    </span>
  )
}
