/*
  Alert — a message in the layout. The banner, not the floater.

  IT REPLACED A HAND-ROLLED ONE, and that one is the argument for it. The board app's
  `.node-banner` (deleted with that product) was the canvas node's "N findings in this group ·
  view" strip, and it carried four raw hex values, a `var(--mono)` that was never a foundation
  token, eight raw pixels and a 9px font — below the smallest level the foundation authors. It
  was also a `<button>`, which is the defect worth naming: an alert that IS a control has no way
  to hold two actions, and a message that can be pressed anywhere is a message whose press
  target is a guess.

  THE TONE DECIDES THE ROLE, AND THAT IS NOT A PROP. Research is unanimous and the platform is too:
  an error or a warning is `role="alert"` — an ASSERTIVE live region that interrupts — and an
  informational or success message is `role="status"`, POLITE, which waits for a pause. Two facts
  that always travel together should not be two props that can disagree, so `tone` is the only one
  a caller sets and the role follows it. The same derivation `Meter` makes from its thresholds.

  IT IS NOT A DIALOG AND IT DOES NOT TAKE FOCUS. An inline alert is part of the page: it arrives in
  the flow, it is read where it sits, and moving focus to it would interrupt a person mid-task to
  tell them something they can already see. `Toast` handles the case where a message arrives from
  nowhere and MIGHT need focus — see the union there.
*/
import type { CSSProperties, ReactNode } from 'react'
import { ConfirmIcon, DismissIcon, TimerIcon } from './Icon'
import { Button } from './Button'

/*
  FOUR TONES, AND THEY ARE SCHEME ISLANDS RATHER THAN COLOURS. `info`, `success`, `warning` and
  `error` each name an island the foundation already defines, so an alert repaints with the theme,
  the scheme and the section without this component naming a single hue.
*/
export type AlertTone = 'info' | 'success' | 'warning' | 'error'

/*
  THE ROLE FOLLOWS THE TONE. Exported so it can be tested as a function rather than through a
  rendered specimen — the same move `Meter` made with `meterRegion`.

  ASSERTIVE INTERRUPTS AND POLITE WAITS, which is the whole distinction: a screen reader stops what
  it is saying for `alert` and finishes the sentence first for `status`. Marking a success message
  assertive is how a page ends up shouting "Saved" over the thing someone was reading.
*/
export const alertRole = (tone: AlertTone): 'alert' | 'status' =>
  tone === 'error' || tone === 'warning' ? 'alert' : 'status'

/* the glyph is the tone's, not the caller's — one drawing per tone, or the tones stop being a set */
const GLYPH: Record<AlertTone, ReactNode> = {
  info: <TimerIcon />,
  success: <ConfirmIcon />,
  warning: <TimerIcon />,
  error: <DismissIcon />,
}

export type AlertProps = {
  tone?: AlertTone
  /** the headline. Required, because a message with no first line is a paragraph in a box */
  title: string
  /** the detail, if there is any — a sentence, a list, anything */
  children?: ReactNode
  /*
    THE ACTIONS SLOT. Buttons, and they are the caller's: an alert that built its own would have to
    know what "Retry" means. It sits at the end on one line and under the text when the alert wraps.

    THEY ARE `small`, AND THAT IS A RULE RATHER THAN A HABIT — the dependency audit found this slot
    was the kit's only handoff with no size guidance at all. The box is `body-s` type and every
    piece of chrome the alert draws for itself (the ✕) is the 24px rung; a `medium` or `large`
    button in here outweighs the message it belongs to. Same rule as Dialog's footer; the story
    sweep in node-kit-test holds both.
  */
  actions?: ReactNode
  /*
    DISMISSIBLE IS DERIVED, as everything in this kit is: hand in a handler and the ✕ appears, leave
    it out and there is nothing to press. No `dismissible` flag to disagree with the handler.
  */
  onDismiss?: () => void
  /** the ✕'s accessible name — it has no text of its own */
  dismissLabel?: string
  /*
    THE GLYPH CAN BE TURNED OFF, and only turned off. It cannot be REPLACED: one drawing per tone is
    what makes the four a set, and a caller who picks their own has made a fifth tone nobody else
    can read.
  */
  glyph?: false
  style?: CSSProperties
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  dismissLabel,
  glyph,
  style,
}: AlertProps) {
  return (
    <div
      className={['nd-alert', `t-${tone}`].join(' ')}
      /* an alert is a REGION, not a control: it takes rung 1 as its own island, so the
         accent inside it belongs to that rung too (tokens.css, THE FILL AXIS) */
      data-level={1}
      /* OPAQUE BY DESIGN, and it says so on the axis that decides materials. This surface
         painted the solid `--surface` before the fills collapsed into one name; now
         `--background` is glass at three rungs of four, and a panel that frosts nothing must
         declare the material rather than rely on which rung it happens to land on. */
      data-surface="normal"
      /*
        THE ISLAND AND THE ROLE ARE THE SAME DECISION, taken from `tone` in two places rather than
        asked of the caller twice.
      */
      data-scheme={tone}
      role={alertRole(tone)}
      style={style}
    >
      {glyph !== false && (
        <span className="nd-alert-glyph" aria-hidden>
          {GLYPH[tone]}
        </span>
      )}
      <div className="nd-alert-body">
        <strong className="nd-alert-title">{title}</strong>
        {children != null && children !== false && <div className="nd-alert-text">{children}</div>}
        {actions && <div className="nd-alert-actions">{actions}</div>}
      </div>
      {onDismiss && (
        <span className="nd-alert-dismiss">
          <Button
            size="small"
            variant="ghost"
            kind="icon-button"
            label={dismissLabel ?? `Dismiss: ${title}`}
            title={undefined}
            leading={<DismissIcon />}
            onClick={onDismiss}
          />
        </span>
      )}
    </div>
  )
}
