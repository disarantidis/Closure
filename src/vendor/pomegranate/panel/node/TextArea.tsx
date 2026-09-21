/*
  TextArea — prose, on more than one line.

  THIS IS A LIFT, NOT A DESIGN. `multiline` used to be a boolean on the text field,
  which made one component answer two questions: a text field holds ONE line that
  scrolls, and a text area holds a paragraph that wraps. Those differ in almost every
  decision below — spell-check, what Enter means, whether the box can be resized, what
  its height even is — so the boolean was a fork running through the whole component
  rather than an option on it.

  What is here is the multiline branch moved out VERBATIM — at the time so the board
  app's four prose sites would render exactly what they rendered before; that app is
  gone, and the branch stays verbatim until the real component is designed. It shares `.nd-textfield`'s
  class names for the same reason: the styling is unchanged, and inventing a second set
  of class names for a shape that has not been redesigned yet would be inventing a
  difference that does not exist.

  WHAT IS STILL OPEN, and should be settled when this is built properly rather than
  copied: the three-row default (`rows={3}`) and `resize: vertical` were the field's
  answers, not this component's; the floating label's geometry was solved for a single
  value row and a paragraph does not have one; and the leading icon, which the field
  positions on its value row, has nowhere obvious to sit above a block of text.

  WHAT CARRIES OVER AND IS NOT IN QUESTION:

  · THE FACE IS THE FOUNDATION'S — GT Ultra, through the text style, like everything
    else. It used to be `--mono`; see TextField's header for why a component cannot
    name a family here and what putting a monospace in the foundation would take.
  · SPELL-CHECK IS ON, and here it is not a fork but the whole point: this shape holds
    PROSE meant for a human to read, so the platform's corrections are what they are
    for. The field's are off for the mirror-image reason.
  · ENTER TAKES ITS NEWLINE — a paragraph never commits on a keystroke. Escape still
    reverts, which is why `onRevert` survives and `onCommit` does not.
  · `invalid` cannot be passed without `describedBy`, closing the same WCAG 3.3.1 gap
    the rest of the kit closes: a border that changes colour is not the error
    identified in text.
  · `maxLength` — the limit and its counter, one prop, exactly as TextField carries
    them and for the reasons its note gives. Prose is where a limit is most often
    real (a usage note that has to fit a card), so this is the shape that needs it
    most rather than the one that inherited it.
*/
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useId } from 'react'

import { fieldLevel, useLevel } from './LevelContext'
import type { TextFieldSize } from './TextField'

type TextAreaBase = {
  value: string
  onChange: (value: string) => void
  /** the accessible name. Required, for the same reason the field's is: a box beside
      a styled <span> is not labelled by it. */
  label: string
  /** placement only — margin and grid position belong to the layout, never to the
      control. Lands on the wrapper, which is the element a layout wants to position. */
  style?: CSSProperties
  /** stretch to the layout that holds it, instead of sharing a flex row */
  block?: boolean
  placeholder?: string
  /** declared, never inferred from `placeholder` — see TextField's note on this prop */
  required?: boolean
  size?: TextFieldSize
  disabled?: boolean
  /** SETTLED, NOT UNAVAILABLE — the native readonly attribute. Still focusable, still
      announced, still full contrast; only the editing is gone. */
  readOnly?: boolean
  autoFocus?: boolean
  /** the limit, and the counter under the box that makes it survivable — see
      TextField's note for why the two are one prop */
  maxLength?: number
  /** a second, quieter value at the far end — the same slot every field in the kit carries.
      On prose it rides the FIRST line, which is where a paragraph's own line is. */
  hint?: ReactNode
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  /** the box REVERTS: Escape. There is deliberately no `onCommit` — Enter belongs to
      the paragraph. */
  onRevert?: () => void
}

type TextAreaValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type TextAreaProps = TextAreaBase & TextAreaValidity

export function TextArea({
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
  maxLength,
  hint,
  onKeyDown,
  onRevert,
  style,
}: TextAreaProps) {
  const id = useId()
  const countId = `${id}-count`
  const counted = maxLength != null

  // a press inside a control must never start a node drag
  const swallowPress = (e: { stopPropagation: () => void }) => e.stopPropagation()

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Escape') onRevert?.()
  }

  /* the backstop, not the rule — see TextField's note: the platform already stops
     every user route to a change, this catches a synthetic event aimed at the node */
  const handleChange = (v: string) => {
    if (disabled || readOnly) return
    onChange(v)
  }

  return (
    <span
      /* invalid is a scheme, and the island is the whole component — see TextField's note */
      data-scheme={invalid ? 'error' : undefined}
      /*
        ONE RUNG OFF ITS GROUND — the step LevelContext computes, since CSS cannot. TextField
        has carried this line since the rungs were deleted; this file copied the `data-scheme`
        line above it and its "see TextField's note", and stopped there.

        THE COST WAS THE WHOLE FILL. `--nd-field-fill` is declared in exactly one block,
        `[data-fill]`, so a wrap without the attribute resolves it to nothing and
        `background: var(--nd-field-fill)` paints NOTHING — every TextArea in the kit was
        fully transparent, at every scheme, level and theme. On a matching ground that is
        invisible, which is why it shipped. On an INVERTING one it is not: an invalid
        TextArea declares `data-scheme="error"`, which restates its ink for the current THEME
        while the ground behind it belongs to a scheme running the other way, and the error
        ink landed on the page at **1.01:1** — `#3D1E19` on `#262626` at inverted/light, and
        the mirror of it at inverted/dark. A 72-coordinate browser sweep found it on eight
        coordinates in this component alone.
      */
      data-fill={fieldLevel(useLevel())}
      className={[
        'nd-textfield-wrap',
        `s-${size}`,
        'is-multi',
        block ? 'is-block' : '',
        disabled ? 'is-disabled' : '',
        readOnly && !disabled ? 'is-readonly' : '',
        counted && value.length >= maxLength ? 'is-full' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <label className="nd-textfield-float" htmlFor={id}>
        {label}
      </label>
      {/* three rows, and not a prop: every prose site on this board is a short paragraph
          you drag open, not a document. `resize: vertical` is the escape hatch, and it
          costs nothing. The number lives once more in CSS as `--nd-textfield-rows`, which
          is what actually reserves the height; this attribute is the no-CSS fallback and
          has to say the same thing. */}
      <textarea
        className={[
          'nd-textfield',
          `s-${size}`,
          'is-multi',
          invalid ? 'is-invalid' : '',
          disabled ? 'is-disabled' : '',
          readOnly && !disabled ? 'is-readonly' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        rows={3}
        maxLength={maxLength}
        spellCheck
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        /* a LIST — see TextField's note: dropping one description to make room for
           the other is how a field announces its allowance and not its error */
        aria-describedby={[describedBy, counted ? countId : null].filter(Boolean).join(' ') || undefined}
        autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
        onPointerDown={swallowPress}
        onChange={(e) => handleChange(e.target.value)}
      />
      {hint != null && <span className="nd-textfield-hint">{hint}</span>}
      {counted && (
        <span className="nd-textfield-count" id={countId}>
          {value.length}/{maxLength}
        </span>
      )}
    </span>
  )
}
