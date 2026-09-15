/*
  ProgressBar — work in flight, drawn as an edge rather than a point.

  THE KIT ALREADY HAD TWO OF THE THREE WAYS TO WAIT, and the peers all draw the same triangle:

    Spinner       a POINT   duration unknown, dimensions unknown
    Skeleton      a SHAPE   duration unknown, dimensions KNOWN
    ProgressBar   an EDGE   the amount is known — or it is not, but the waiting belongs at a
                            boundary rather than in the content

  Astryx states those boundaries as mutual cross-references, which is how you can tell they
  were argued rather than assembled: its Spinner says "for content with known dimensions, use
  Skeleton instead", its Skeleton says the inverse, and both say "don't combine them on the
  same content area — pick one." That last rule is the one most easily broken here, because
  `Button` already carries a spinner while loading; a bar and a button-spinner for the same
  operation is two claims about one wait.

  IT IS THE PLATFORM'S ELEMENT, which is the same trade `DropDownSelect` made with a real
  `<select>` and `Popover` made with the top layer. `<progress>` carries an implicit
  `role="progressbar"`, turns `value`/`max` into `aria-valuenow`/`aria-valuemax` with nothing
  written here, and models INDETERMINATE natively — omit `value` and the element reports
  `position: -1`, with a `:indeterminate` pseudo-class to paint the two states apart. Verified
  in the browser before this was written: track, fill, height and the pill corner all take the
  kit's values through the vendor pseudo-elements.

  WHAT IT COSTS is that the parts are vendor-prefixed and must be written twice —
  `::-webkit-progress-*` and `::-moz-progress-bar`. That is a smaller price than reimplementing
  the semantics, which is the same conclusion every one of those earlier trades reached.

  IT HAS A RESOLUTION, NOT JUST A VALUE — Carbon's `status`, and the half most kits leave out.
  Work does not only advance; it finishes, and it fails. A bar that can only fill has nowhere
  to put a failed upload, so the caller reaches for a second component and the two disagree
  about what just happened. `state` is that axis, and it is what makes the bar a place a
  failure can land.

  THE LABEL IS REQUIRED AND USUALLY HIDDEN. A bar with no name announces a number with no
  subject — "47%" of what. Every peer says the same thing in the same words, and this kit has
  made that unwritable everywhere else, so it is unwritable here.

  IT IS NOT A METER. Spectrum keeps these apart and the platform agrees: `<meter>` is a STATIC
  quantity — a quota, a disk, a score — and `<progress>` is something CHANGING over time. A
  meter drawn as a progress bar reads as a stalled operation. If a gauge is ever needed here it
  is a different component on a different element, and this one deliberately does not stretch
  to cover it.
*/
import type { CSSProperties, ReactNode } from 'react'
import { isFloor, recessLevel, useLevel } from './LevelContext'
import { forwardRef, useId } from 'react'

/*
  THE RESOLUTION AXIS. `active` is the ordinary case and needs no saying; the other two are
  ENDINGS, and they are what stop a caller reaching for a second component when the work
  stops. Tone comes from the scheme as everywhere else in this kit — `error` inside
  `data-scheme="error"` is the error bar, in both themes, with no colour named here.
*/
export type ProgressState = 'active' | 'done' | 'failed'

/*
  THE RUNGS ARE THE TRACK'S, AND THE TYPE FOLLOWS BUTTON'S LADDER.

  A bar has no rung on the kit's control ladders — the row ladder (24/32/56) and Button's
  (32/50/56) are a control's HEIGHT and a bar is not a control, the field ladder (50/56) is a box
  around text. What a bar's size
  means is how thick the edge is, so the track takes three steps off the spacing scale:

    small    4   `component-0`, the smallest rung there is — a hairline at a panel's boundary
    medium   8   `component-1` — the standalone bar, in a card or a dialog
    large   12   `component-3` — the subject of its own view, a wizard's one running task

  `component-2` (10) is skipped and that is the only arbitrary-looking step here. Four rungs
  drawn together settled it: 8 and 10 cannot be told apart at this height without measuring
  them, and a ladder whose middle two steps are indistinguishable is three sizes pretending
  to be four.

  THE TYPE IS BUTTON'S, RUNG FOR RUNG — microcopy / body-s / body-l — because the kit has one
  ladder and a bar's label sits beside buttons and fields that already climb it. The FOOT does
  not climb: every hint in this kit is microcopy (`.nd-hint`, `.nd-textfield-hint`,
  `.nd-select-hint`), and a footnote that grows into the label's size stops being a footnote.
*/
export type ProgressSize = 'small' | 'medium' | 'large'

/*
  THE BAR TURNS, AND `writing-mode` IS HOW — not a transform.

  `<progress>` under `writing-mode: vertical-rl` becomes a true vertical bar and its fill runs
  top to bottom, with the track, the corner and both engines' pseudo-elements intact. Verified in
  the browser against the two alternatives before a line of this was written.

  A `transform: rotate(90deg)` also draws correctly and was rejected: a transform does not resize
  the LAYOUT box, so a rotated bar still occupies a horizontal strip and every ancestor has to be
  told the real length by hand. The writing mode changes the box itself, so a vertical bar takes
  vertical space the way anything else does.

  ONE TRAP, AND IT COST A WRONG ANSWER ONCE ALREADY: under a vertical writing mode the element's
  OWN logical properties swap — `inline-size` becomes the vertical extent and `block-size` the
  thickness. A first probe set them the horizontal way round, drew a 90×8 bar and concluded the
  technique did not work. The rules below use PHYSICAL `width`/`height` on the track for exactly
  that reason: under a rotated writing mode the physical pair is the unambiguous statement.

  THE FILL RUNS TOP TO BOTTOM, which is reading order and which is what a stepper's connector
  needs. A bottom-up bar — a level, a thermometer — is a different component's problem.
*/
export type ProgressOrientation = 'horizontal' | 'vertical'

/*
  WHERE THE NUMBER GOES, and it is a placement rather than a slot for one reason: a slot takes
  ANY content, and this is the component's OWN value — the one the formatter produced, in tabular
  figures, in the recessive colour. Putting it somewhere else through a slot means hand-writing
  it at the call site and losing all three.

  A bar has eight places a number could sit. Seven are reachable (see the specimen sheet) and
  six of those are already slots, so this axis deliberately covers only the three that the
  FORMATTED value has any business being in:

    head     above the bar, at the end — the default, and what a stack of bars wants: a column
             of right-aligned numbers, each one under the last
    inline   after the track, on its own line — the compact case, one row in total
    foot     below the bar, at the end — when the number is a footnote rather than a heading

  THE EIGHTH IS INSIDE THE TRACK, and it stays unreachable: a number there has to read against
  the fill AND the unfilled remainder at once, which this kit's contrasts cannot hold for both,
  and a track thick enough to carry text has stopped being an edge.
*/
export type ProgressValueAt = 'head' | 'inline' | 'foot'

/*
  A RING IS A SHAPE, NOT A COMPONENT — and the `<progress>` keeps every semantic either way.

  THE DRAWING IS AN SVG STROKE, WHICH IS WHAT `Spinner` ALREADY IS. The first build painted the
  ring on the element itself with a `conic-gradient` and a radial `mask`. That works, and it is
  why the shape-or-sibling question was settled the way it was — but it cannot round the ends of
  its own arc: a conic gradient stops square, so round caps had to be separate circles laid over
  the joins, and at any real zoom that reads as a pale seam where two antialiased shapes meet.
  Measured before it was replaced: both caps full `--accent` at opacity 1, so the band was the
  OVERLAP rather than a colour. A hack that looked like one.

  An SVG stroke rounds its own ends, because the cap is part of the stroke rather than laid on top
  of it. It is also the drawing `Spinner` already makes, down to `pathLength={800}` — so the kit's
  two circular indicators are now one technique with two states rather than two techniques.

  THE ELEMENT IS STILL THERE AND STILL CARRIES EVERYTHING. The `<progress>` sits in the line, out
  of sight but in the accessibility tree, holding the role, the value, the indeterminate state and
  the label; the SVG is `aria-hidden` and only draws. That is the division `Spinner` makes, and the
  one `DropDownSelect` makes with its painted face: the platform keeps the meaning, the kit keeps
  the picture.

  So everything that makes ProgressBar what it is carries over unchanged: the element's semantics,
  the `state` endings, the required label, the indeterminate model, the three rungs. Only the
  drawing differs — which is exactly the case for a prop rather than a sibling. Meter and
  ProgressBar are two components because they MEAN different things; a ring and a bar mean the
  same thing.

  AND THE RING REACHES THE ONE PLACE A BAR REFUSES. A number inside a bar's track has to read
  against the fill and the remainder at once; a ring's centre is neither — it is background, with
  the fill kept out at arm's length. So the ring's `head` band IS its centre, which is where every
  peer that draws one puts the number, and for the same reason.
*/
export type ProgressShape = 'bar' | 'ring'

export type ProgressBarProps = {
  /*
    REQUIRED, AND USUALLY HIDDEN. A bar with no name announces a number with no subject.
    `labelHidden` moves it out of sight and leaves it in the tree — the same construction
    Checkbox, Radio and Switch use.
  */
  label: string
  labelHidden?: boolean
  /*
    THE AMOUNT DONE. Leave it undefined and the bar is INDETERMINATE — which is the platform's
    own model, not a flag invented here: `<progress>` with no `value` reports `position: -1`
    and matches `:indeterminate`. So "we don't know" is expressed by not saying, which is the
    one way it cannot be said wrong.
  */
  value?: number
  max?: number
  /** show the value as text beside the label — percent by default */
  showValue?: boolean
  /** how the value reads when shown. Defaults to a percentage of `max` */
  formatValue?: (value: number, max: number) => string
  /*
    THE ENDING. `done` and `failed` are what let one component carry the whole life of an
    operation; without them a failure has nowhere to go but a second component.
  */
  state?: ProgressState
  size?: ProgressSize
  /*
    VERTICAL TAKES ITS LENGTH FROM THE CONTAINER, exactly as horizontal takes its width from one.
    The track is `height: 100%`, so a vertical bar in a box with no height is a bar with no
    length — the same way a horizontal bar in a zero-width box has none.
  */
  orientation?: ProgressOrientation
  /** where the formatted value sits. Ignored unless `showValue` */
  valueAt?: ProgressValueAt
  /*
    THE SAME BAR, BENT. `ring` keeps every semantic the bar has — it is the same element — and
    changes only how it is drawn and where its `head` value lands: a bar puts that above and at
    the end, a ring puts it in the middle.
  */
  shape?: ProgressShape
  /*
    FOUR SLOTS, AND THEY TAKE ANYTHING — an icon, a Badge, a Tag, an Avatar, a link.

    `leading`/`trailing` ride the track's own line, vertically centred on it: a file glyph
    before, a tick or a count after. `head` sits in the head row between the label and the
    value; `foot` is the whole line under the track and is what the string-only `hint` became.

    THEY ARE ADDITIVE, NEVER A REPLACEMENT FOR THE LABEL, and that is what keeps the
    accessible name safe. `label` is the one string this component insists on and it is the
    only thing inside the `<label>`; every slot renders OUTSIDE it, so no amount of content in
    them can get into the name. A `head` that replaced the label would have made "47%" of
    nothing writable again.

    AND THEY ARE LIVE, WHICH IS THIS KIT'S ONE EXCEPTION TO "A SLOT IS DECORATION, NEVER A
    SECOND TARGET". That rule is structural on Button, Chip and SegmentedControl because the
    host's whole box IS the target, so anything hittable inside it steals or duplicates the
    press. A ProgressBar is not a target at all — it has no handler and no tab stop — so a
    "View log" link in `foot` is reachable exactly the way a link in a paragraph is, and
    making it pointer-inert would break it for no gain. ListItem reached the same exemption
    from the other direction, by moving its target out of the way of its content.
  */
  leading?: ReactNode
  trailing?: ReactNode
  head?: ReactNode
  foot?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

const percent = (v: number, m: number) => `${Math.round((v / m) * 100)}%`

/*
  WHAT COUNTS AS FILLED. `false` and `''` are how a caller says "not this one" from a
  conditional, and rendering a wrapper around either draws a gap that nothing is in. Button and
  Tag each carry this same three-line test; it is duplicated rather than shared because the
  three of them have no other reason to import from one another.
*/
const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(function ProgressBar(
  {
    label,
    labelHidden = false,
    value,
    max = 100,
    showValue = false,
    formatValue = percent,
    state = 'active',
    size = 'medium',
    orientation = 'horizontal',
    valueAt = 'head',
    shape = 'bar',
    leading,
    trailing,
    head,
    foot,
    style,
  },
  ref
) {
  /*
    INDETERMINATE IS THE ABSENCE OF A VALUE, all the way down. React must not render
    `value={undefined}` as `value=""` — an empty value attribute is a determinate zero in some
    engines — so the attribute is spread in only when there is a number to put in it.
  */
  const indeterminate = value == null
  const clamped = indeterminate ? undefined : Math.min(Math.max(value, 0), max)
  const id = useId()
  /*
    BUILT ONCE, PLACED ONCE. An indeterminate bar has no number to show at all — the value is the
    thing it does not know — so this is `null` there whatever `showValue` says, and every branch
    below tests the same one thing.
  */
  const shownValue = showValue && !indeterminate ? formatValue(clamped!, max) : null
  /*
    THE RING'S HEAD BAND IS ITS CENTRE. Same prop, same default, same three bands — a shape
    changes where a band IS, not which bands exist. So a ring with the default `valueAt` puts its
    number in the middle without the caller asking, and `inline` and `foot` still mean beside and
    below.
  */
  const centred = shape === 'ring' && valueAt === 'head'

  const ground = useLevel()
  return (
    <div
      ref={ref}
      /* the track is a GROOVE: one rung down from the ground it is cut into. At the floor
         there is no rung below, so `is-floor` hands the stylesheet its own fallback
         (node.css, AND THE GROOVE IS THE SAME MECHANISM POINTED DOWN) */
      data-fill={isFloor(ground) ? undefined : recessLevel(ground)}
      data-floor={isFloor(ground) || undefined}
      className={[
        'nd-progress',
        `s-${size}`,
        `o-${orientation}`,
        `v-${valueAt}`,
        `sh-${shape}`,
        `is-${state}`,
        indeterminate ? 'is-indeterminate' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      /*
        THE FRACTION HAS TO REACH CSS, because a `conic-gradient` cannot read the element's own
        `value` — the shadow parts can, and they are rectangles. So the one number the ring needs
        is published as a custom property and the element keeps everything else.
      */
      style={
        shape === 'ring' && !indeterminate
          ? { ['--nd-progress-pct' as string]: String(Math.round((clamped! / max) * 100)), ...style }
          : style
      }
      /*
        THE ENDING IS A SCHEME, which is `DropDownSelect`'s move for `invalid` applied to a
        state rather than a variant: "an invalid select is the SAME select inside
        data-scheme='error'". There is no green and no red in this component — a finished bar
        is this bar inside `success`, a failed one is this bar inside `error`, and both repaint
        accent, stroke and the container ladder together, in whichever theme is running.

        It also means the ending survives the caller's own tone. A bar inside `data-scheme="brand"`
        that fails still reads as failed, because the state is the more specific island.
      */
      data-scheme={state === 'done' ? 'success' : state === 'failed' ? 'error' : undefined}
    >
      {/*
        THE HEAD ROW EXISTS ONLY IF SOMETHING IS IN IT. A bar with a hidden name, no value and
        no head slot is a bare edge at a panel's boundary, and an empty row above it would put
        a line of leading there that nothing occupies.
      */}
      {/*
        THE VALUE IS ONE ELEMENT IN ONE OF THREE PLACES, not three elements with two hidden. It is
        built once, here, and rendered into whichever band `valueAt` names — so the formatter, the
        tabular figures and the recessive colour follow it wherever it goes, which is the whole
        reason this is a placement rather than something a caller writes into a slot.
      */}
      {(!labelHidden || (shownValue != null && valueAt === 'head' && !centred) || slotted(head)) && (
        <div className="nd-progress-head">
          {/*
            A REAL `<label for>` WHEN THE NAME IS VISIBLE. `<progress>` is a labelable element —
            it is on the same list as `input`, `select` and `textarea` — so the visible text can
            BE the accessible name rather than a second copy of it beside an `aria-label`. Two
            names for one bar is how "Wiring tokens" ends up announced twice, and the platform
            already offers the association for free.
          */}
          {!labelHidden && (
            <label className="nd-progress-label" htmlFor={id}>
              {label}
            </label>
          )}
          {/*
            THE HEAD SLOT SITS BETWEEN THE NAME AND THE NUMBER, and grows to fill what is left.
            That is the one place a third thing can go without displacing either: the label
            holds the start because it is the subject, the value holds the end because a column
            of right-aligned numbers is how a stack of bars stays readable.
          */}
          {slotted(head) && <span className="nd-progress-slot nd-progress-slot-head">{head}</span>}
          {shownValue != null && valueAt === 'head' && !centred && (
            <span className="nd-progress-value">{shownValue}</span>
          )}
        </div>
      )}
      {/*
        THE TRACK KEEPS ITS OWN LINE, and the flanking slots ride it rather than the head. An
        icon before and after is about THIS bar — a file glyph, a tick, a count — so it belongs
        on the bar's line, centred on a track that may be only 4px tall. The row's height is the
        taller of the glyph and the track; the track takes the rest of the width.
      */}
      <div className="nd-progress-line">
        {slotted(leading) && <span className="nd-progress-slot">{leading}</span>}
        {/*
          THE ELEMENT CARRIES THE SEMANTICS. No `role`, no `aria-valuenow`, no `aria-valuemax` —
          `<progress>` supplies all three, and writing them by hand would be a second, drifting
          copy of what the element already says.
        */}
        <progress
          className="nd-progress-track"
          id={id}
          {...(labelHidden ? { 'aria-label': label } : {})}
          max={max}
          {...(indeterminate ? {} : { value: clamped })}
        />
        {/*
          THE RING'S DRAWING — `aria-hidden`, because the `<progress>` beside it already says all
          of this. `pathLength={800}` normalises the circumference exactly as `Spinner` does, so
          the dash is a fraction of 800 at any diameter and the two share one piece of arithmetic.

          THE RADIUS FOLLOWS FROM THE 1:8 STROKE: in a 100-unit box the stroke is 12.5 units, so
          the centreline sits at 50 - 6.25 = 43.75 and the ring never clips its own edge.
        */}
        {shape === 'ring' && (
          <svg className="nd-progress-ring" viewBox="0 0 100 100" aria-hidden focusable="false">
            <circle className="nd-progress-ring-track" cx="50" cy="50" r="43.75" pathLength={800} />
            <circle
              className="nd-progress-ring-arc"
              cx="50"
              cy="50"
              r="43.75"
              pathLength={800}
              transform="rotate(-90 50 50)"
              {...(indeterminate ? {} : { strokeDasharray: `${Math.round((clamped! / max) * 800)} 800` })}
            />
          </svg>
        )}
        {slotted(trailing) && <span className="nd-progress-slot">{trailing}</span>}
        {/* `inline` puts it AFTER the trailing slot: the slot decorates the bar, the number
            reports on it, and a glyph between the two would separate the count from its subject */}
        {shownValue != null && valueAt === 'inline' && <span className="nd-progress-value">{shownValue}</span>}
        {/* the ring's own band — inside it, over the hole, which is background rather than fill */}
        {shownValue != null && centred && <span className="nd-progress-value nd-progress-centre">{shownValue}</span>}
      </div>
      {(slotted(foot) || (shownValue != null && valueAt === 'foot')) && (
        <div className="nd-progress-foot">
          {slotted(foot) && <span className="nd-progress-footnote">{foot}</span>}
          {shownValue != null && valueAt === 'foot' && <span className="nd-progress-value">{shownValue}</span>}
        </div>
      )}
    </div>
  )
})
