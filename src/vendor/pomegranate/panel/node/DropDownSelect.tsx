/*
  DropDownSelect — a value picker, for a canvas that clips and scales.

  THE NAME SAYS BOTH HALVES, WHICH IS THE POINT. "Dropdown" alone names only the
  mechanism, and four different components drop things down; conflating them is the
  classic design-system mistake, and the tell is one component used both for "choose a
  size" and for "delete this item".

    DropDownSelect  role=listbox   picks a VALUE — has a form value, submits
    Menu            role=menu      fires an ACTION — no value, no form
    Combobox        role=combobox  type to filter, then pick
    Popover         no role        arbitrary content in a floating layer

  Radix, Spectrum, Carbon and Polaris all ship these as separate primitives with
  separate ARIA contracts. This is the first of the four, and it is named for the
  mechanism AND the job: it drops down, and what it drops down is a list of values you
  SELECT from. A caller reaching for a menu will not find this by that name, which is
  the whole reason the second half is there.

  THE POPUP IS THE PLATFORM'S, and that decision is reaffirmed rather than inherited.
  Two facts about the board force it:

    · a node card is `overflow: hidden`, because it must clip its rows to the corner
      radius — a popup rendered inside the card is cut off at the card's edge.
    · the world is `transform: translate(...) scale(z)` at any zoom from 3% to 200%, so
      a portalled popup has to undo an ancestor transform to sit where the trigger is,
      and keep undoing it while the canvas pans. Every frame is a chance to be wrong.

  A real <select> is drawn by the browser in the OS layer: never clipped, never
  displaced, and keyboard, typeahead, touch and screen-reader semantics arrive free.
  GOV.UK's published research argues the same way; Polaris renders a native select for
  the same reason. What it costs is that the OPEN LIST cannot be styled — `swatch` and
  `hint` show in the trigger, and the option text carries the hint as a suffix.

  When the board grows a picker that must SEARCH, that is a Combobox with a
  transform-aware portal, not a second style of this one. Nothing on the board searches
  a list today, so it does not exist yet.

  THE LABEL IS REQUIRED, and this is the correction that prompted the rebuild.
  COMPONENTS.md holds this component up as the kit's flagship constraint — "DropDownSelect
  requires label; an unnamed control is not something to remember to avoid, it is
  unwritable" — and cites the five `select-name` criticals axe found before it. The type
  said `label?: string`. All five call sites happened to pass one, which is exactly why
  nothing noticed for so long. A constraint that lives in a doc and not in a type is a
  convention, and the kit's whole claim is that it does not rely on those.
*/
import type { CSSProperties, ReactNode } from 'react'
import { useId } from 'react'
import { CaretIcon } from './Icon'
import { glassLightRef } from './glassLight'
import type { TextFieldSize } from './TextField'
import { fieldLevel, useLevel } from './LevelContext'

export type DropDownSelectOption = {
  value: string
  label: string
  /** what the value resolves to — a px size, a hex. Shown in the trigger, and
      appended to the option text, because the native list cannot style one.
      NOT under TextField's twelve-character cap, and the difference is in the flex:
      `.nd-select-hint` is `flex: 0 999 auto` with an ellipsis — this is the hint that
      gives way when the value is long — so `glass-neutral.300` costs the label nothing
      it cannot take back, where the same string in a text field would be permanently
      subtracted from a value someone is typing. */
  hint?: string
  /** a colour chip before the label, for token pickers */
  swatch?: string
  disabled?: boolean
}

export type DropDownSelectGroup = { group: string; options: DropDownSelectOption[] }
/* an ALIAS of `TextFieldSize` — one field ladder, one type; see Combobox for the argument */
export type DropDownSelectSize = TextFieldSize

const isGroup = (o: DropDownSelectOption | DropDownSelectGroup): o is DropDownSelectGroup => 'group' in o

type DropDownSelectBase = {
  value: string
  options: (DropDownSelectOption | DropDownSelectGroup)[]
  /** the accessible name — REQUIRED. A select inside a labelled row still needs one
      of its own, because the row's label is not programmatically tied to it. */
  label: string
  size?: DropDownSelectSize
  disabled?: boolean
  /** the glass rim's angle tracks the cursor by default (see glassLight.ts) — set
      false to pin it back to the foundation's static angle instead. A disabled
      select never tracks regardless of this. */
  dynamicLight?: boolean
  /*
    READ-ONLY: THE VALUE IS REAL, YOU JUST CANNOT CHANGE IT HERE.

    Not a shade of `disabled`, and the difference is the whole reason it exists. A
    disabled control is INACTIVE — out of the tab order, exempt from the contrast
    floor, and "come back when something else is true". A read-only one is ACTIVE and
    settled: still focusable, still announced with its value, still legible at full
    contrast, still submitted. The board's case is a component that FOLLOWS a style
    group — its radius is a fact you can read, and the place to change it is the group,
    not here. Showing that as `disabled` would say "unavailable", which is false: the
    value is very much available, it is the EDITING that lives elsewhere.

    HTML HAS NO `readonly` FOR <select>, which is the actual difficulty. `readonly` is
    defined for text-entry controls only, so the usual workarounds are to disable it
    (loses focus, changes meaning) or to intercept mousedown and every key that opens a
    popup (fragile, and the popup still opens on some platforms).

    This does neither. It renders the select with EXACTLY ONE OPTION — the current
    one — so there is nothing to change the value TO. Nothing is intercepted and
    nothing is faked: the control is genuinely unchangeable because the choice set is a
    single element, while staying a real, focusable, announced <select> that submits
    its value. `aria-readonly` then states in the accessibility tree what the option
    list already enforces.

    …AND IT IS A UNION WITH `onChange`, the same construction `invalid`/`describedBy`
    use. `onChange` used to be optional for everyone, which made two very different
    call sites cost the same: the read-only select that genuinely has nothing to
    report, and the editable select whose author forgot the handler — a control that
    drops open, changes, and silently tells nobody. Now the type splits them: say
    `readOnly` and the handler is yours to omit; leave it editable and the compiler
    demands one. (`disabled` is not part of this — disabled is a STATE a control
    passes through, and a control that will wake up needs its handler already wired.)
  */
  /*
    A LEADING SLOT — whatever is in it sits at the front of the field and stays there.

    It is `icon` rather than `left`, and the asymmetry with Button's `left`/`right` pair
    is deliberate: the right side of this control is not available to a caller, because
    the caret owns it. Offering a `right` that quietly loses to a chevron would be a
    worse kind of consistency than not offering one.

    It takes a NODE, like Button's slots, so it is not limited to icons — a status dot
    or a count works the same. It is centred on the FIELD rather than on the text row,
    the same as the caret, so it holds still while the label lifts and the value
    arrives beneath it.
  */
  icon?: ReactNode
  placeholder?: string
  title?: string
  block?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  AN ERROR MUST BE SAYABLE, so `invalid` cannot be passed alone.

  `invalid` paints the error scheme and sets aria-invalid, which together report THAT
  the value is wrong. WCAG 3.3.1 asks for something else: that the error be identified
  IN TEXT. A red border and "invalid entry" tell a screen-reader user their field is
  broken and nothing about what would fix it — and colour alone tells a sighted user
  with low vision even less.

  `describedBy` is the id of the element carrying that text, and it used to be an
  optional prop beside an optional `invalid`, which meant the honest version and the
  useless version cost exactly the same to write. Now the type will not let them come
  apart: say `invalid` and you must say where the reason is.

  It is an ID rather than a message slot because the one-line face has nowhere to put a
  second line — the ROWS own the text lines, and the row's hint is where this text
  already lives. This is the same argument the label made: a constraint that lives in a
  doc and not in a type is a convention, and this kit does not run on those.
*/
type DropDownSelectValidity =
  | { invalid: true; describedBy: string }
  | { invalid?: false; describedBy?: string }

type DropDownSelectEditability =
  | { readOnly: true; onChange?: (value: string) => void }
  | { readOnly?: false; onChange: (value: string) => void }

export type DropDownSelectProps = DropDownSelectBase & DropDownSelectValidity & DropDownSelectEditability

export function DropDownSelect({
  value,
  options,
  onChange,
  label,
  size = 'small',
  disabled = false,
  readOnly = false,
  icon,
  invalid = false,
  placeholder,
  describedBy,
  title,
  block = false,
  dynamicLight = true,
  style,
}: DropDownSelectProps) {
  const flat = options.flatMap((o) => (isGroup(o) ? o.options : [o]))
  const current = flat.find((o) => o.value === value)
/*
  THE LABEL ALWAYS FLOATS — there is no `labelPlacement` any more.

  It had two values and `hidden` was the default, on the argument that the board's fields
  sit in panes whose headings already name them. That is still true of those panes, but a
  field that only carries its name for assistive tech is a field whose name is invisible
  the moment it is reused anywhere else — and a placement prop is a decision every call
  site has to get right. One label, always drawn, is the thing that cannot be got wrong.

  The cost is real and was measured before the change: every field is two lines now, so
  the board's fields went from 32 / 38 to 50 / 56 — this one included, once its box stopped
  counting its own border twice; see the `box-sizing` note in node.css.
*/
  const id = useId()

  return (
    <span
      ref={disabled || !dynamicLight ? undefined : glassLightRef}
      /*
        ONE RUNG OFF ITS GROUND — the step LevelContext computes, since CSS cannot. Without
        the attribute `--nd-field-fill` is undeclared (it lives in exactly one block, keyed on
        `[data-fill]`), so `background: var(--nd-field-fill)` is invalid at computed-value time
        and this surface paints NOTHING. Invisible on a matching ground, which is how it
        shipped; a 72-coordinate browser sweep is what found it.
      */
      data-fill={fieldLevel(useLevel())}
      className={[
        'nd-select',
        `s-${size}`,
        disabled ? 'is-disabled' : '',
        /* disabled outranks read-only: a control that is unavailable is not
           "unavailable but also settled", it is simply unavailable */
        readOnly && !disabled ? 'is-readonly' : '',
        invalid ? 'is-invalid' : '',
        block ? 'is-block' : '',
        current ? '' : 'is-placeholder',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      /*
        INVALID IS A SCHEME. There is no red in this file and no `--nd-false`: an
        invalid select is the SAME select inside `data-scheme="error"`, which repaints
        accent, stroke and the container ladder together — the argument that removed
        the button's `danger` variant, applied to a state instead of a variant. It
        also means hover, pressed and focus keep working while invalid, because they
        read state rungs rather than one fixed colour.
      */
      data-scheme={invalid ? 'error' : undefined}
      title={title}
    >
      {/* THE LEADING SLOT. Outside the face for the same reason the caret is: it belongs
          to the control, not to the line of text that happens to be showing, so it does
          not move when the label lifts. It sits in front of whatever is currently
          there — the value once something is chosen, the label while nothing is. */}
      {icon && (
        <span className="nd-select-leadbox" aria-hidden>
          {icon}
        </span>
      )}

      {/*
        A REAL <label>, NOT MORE PAINTED TEXT — and deliberately outside the aria-hidden
        face. Once the label is visible it must BE the accessible name rather than sit
        beside one: a `aria-label` that says something the eye cannot read is how a
        control ends up announced as "Corner radius" while the screen says something
        else, and voice-control users address what they can see (WCAG 2.5.3, Label in
        Name). So in this mode the <label> owns the name and `aria-label` is dropped
        entirely — one name, from the text a sighted user is already reading.

        `pointer-events: none` in CSS, because it lies on top of the control it names.
      */}
      <label className="nd-select-float" htmlFor={id}>
        {label}
      </label>

      {/* WHAT YOU SEE. Purely presentational and aria-hidden — the real control is
          underneath, so none of this is announced twice. */}
      <span className="nd-select-face" aria-hidden>
        {current?.swatch && <i className="nd-select-swatch" style={{ background: current.swatch }} />}
        {/* Empty reads as EMPTY when a label is floating over it: the label is sitting
            in this spot at this size, and a dash beside it would be a second answer to
            the same question. Without a floating label the dash still earns its place —
            something has to occupy the line. */}
        <span className="nd-select-label">
          {current?.label ?? ''}
        </span>
        {current?.hint && <span className="nd-select-hint">{current.hint}</span>}
      </span>

      {/*
        THE CARET IS ITS OWN BOX, OUTSIDE THE FACE.

        It used to be the last flex item in the face, which made its position a
        consequence of whatever the face was doing — and once a floating label reserved
        a line at the top of that face, the caret inherited the offset and sat low. A
        glyph that means "this opens" belongs to the CONTROL, not to the row of text
        inside it, so it is lifted out and centred against the field itself. Same place
        in every size, every state, labelled or not.

        NO CARET WHEN THERE IS NOTHING TO DROP DOWN. It is a promise that pressing this
        offers alternatives; a read-only select has none, so drawing one would be the
        control lying about what it does. Its absence is also the fastest way to tell
        read-only from rest at a glance, which matters because read-only keeps full text
        contrast and cannot rely on looking faded the way disabled does.
      */}
      {!readOnly && (
        <span className="nd-select-caretbox" aria-hidden>
          <CaretIcon className="nd-select-caret" size="100%" />
        </span>
      )}

      {/* WHAT IT IS. */}
      <select
        className="nd-select-native"
        id={id}
        value={value}
        disabled={disabled}
        /*
          A PLACEHOLDER IS A REQUIRED-NESS CLAIM, so it is announced as one.

          "Choose a radius…" tells a sighted reader the field is unfilled and must be
          filled. An AT user got none of that: just a select whose current value
          happened to be that sentence. The prompt is drawn, not semantic.

          It is INFERRED rather than taken as a prop because the inference is exact
          here — the placeholder option is disabled and unmounts on first selection, so
          there is no route back to empty. A field you cannot empty is a field you must
          fill. (`aria-required`, not `required`: nothing on this board submits a form,
          and `required` would additionally invite native validation UI that the board
          has no place to draw.)

          It stays true after a choice is made. Required-ness is a property of the
          field, not of its current emptiness.
        */
        aria-required={placeholder ? true : undefined}
        /* states in the accessibility tree what the one-option list already enforces —
           belt and braces on purpose, because the enforcement is a consequence of the
           option set and a reader should not have to infer it from a count of one */
        aria-readonly={readOnly && !disabled ? true : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        /*
          THE GUARD IS THE BACKSTOP, THE OPTION SET IS THE RULE.

          The one-option list already means no user action can reach a different value.
          This exists for the changes a user does not make: a synthetic event, a test
          harness, a browser extension, an autofill pass. Assigning a value that is not
          in the list makes a <select> fall to `""` with selectedIndex -1, so without
          this line a stray change event does not just fail to change the value — it
          CLEARS it, and a read-only field is the one field that must never lose the
          value it exists to display.

          Found by trying it rather than by reasoning about it: the comment above the
          option list first claimed onChange was "unreachable rather than ignored",
          which was true of the interface and not true of the element.
        */
        onChange={(e) => {
          if (readOnly && !disabled) return
          onChange?.(e.target.value)
        }}
        // a press inside a control must never start a node drag
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* DISABLED, and that closes a real hole: an enabled empty option is a
            destination, so typing its first letter fired onChange('') — and in the
            invalid case that silently discarded the unresolved value, the one piece of
            evidence of what the field used to bind. Polaris disables its placeholder
            option for exactly this reason. Emptiness that MEANS something is authored
            as a real option instead: `{ value: '', label: 'inherit (base)' }`. */}
        {placeholder && !current && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {/*
          THE CHOICE SET IS THE ENFORCEMENT. A read-only select is rendered with the
          current option and nothing else, so every route that could change a value —
          pointer, arrow keys, typeahead, a platform picker wheel, an AT "set value"
          action — arrives at the value it already has. The state is a property of the
          DATA rather than of a guard, which is why it cannot be defeated by an
          interaction nobody anticipated.

          That covers everything a user can do, and not everything that can happen: a
          synthetic change event still reaches the element. `onChange` carries the
          backstop for that case; see the note on it.
        */}
        {(readOnly && !disabled ? (current ? [current] : []) : options).map((o) =>
          isGroup(o) ? (
            <optgroup key={o.group} label={o.group}>
              {o.options.map((opt) => (
                <Opt key={opt.value} {...opt} />
              ))}
            </optgroup>
          ) : (
            <Opt key={o.value} {...o} />
          )
        )}
      </select>
    </span>
  )
}

/** the option's text carries its hint, because the native list cannot style one */
function Opt({ value, label, hint, disabled }: DropDownSelectOption): ReactNode {
  return (
    <option value={value} disabled={disabled}>
      {hint ? `${label} · ${hint}` : label}
    </option>
  )
}
