/*
  Toast — the same message, arriving from nowhere.

  IT COMPOSES `Alert` RATHER THAN REDRAWING IT. Two components was the call, and this is how two
  components avoid becoming two vocabularies: the toast owns WHERE a message lives and HOW LONG, and
  `Alert` owns what one looks like. So the tone ladder, the glyph set, the dismiss and the
  tone-to-role derivation exist exactly once, and a change to any of them moves both.

  THE HOST IS THE PLATFORM'S TOP LAYER, measured before it was chosen. `popover="manual"` gives:

    · `position: fixed` from the UA, and the TOP LAYER — no z-index war, no portal, no
      `document.body` append, and nothing an `overflow: hidden` ancestor can clip.
    · NO focus move on open — measured, `document.activeElement` stayed on `<body>`.
    · NO light dismiss — `manual` is the one popover mode that does not close on an outside press,
      which is exactly right for a message nobody asked for.

  `Menu` and `Popover` already use this attribute, so this is the kit's third use of it rather than
  a new mechanism.

  ─── AND THE ONE COMBINATION THAT IS FORBIDDEN, IN THE TYPE.

  A toast that AUTO-DISMISSES and carries an ACTION is broken, and the research is unanimous about
  why: a keyboard user, a screen-magnifier user or anyone reading slowly may never reach the button
  before it vanishes. That is WCAG 2.2.1, Timing Adjustable.

  So the two are mutually exclusive here. A toast either:

    · has a `duration` — it announces itself and leaves. `role` is the tone's live region, focus
      never moves, and there is nothing in it to miss.
    · has `actions` — it stays until dismissed, takes `role="dialog"` and MOVES focus to itself,
      which is what the research prescribes for a notification holding controls.

  Writing both is a type error, the same way `Dialog`'s `dismissible: false` requires `actions`. The
  bad state stops being expressible rather than being documented as discouraged.
*/
import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, alertRole } from './Alert'
import type { AlertTone } from './Alert'
import { ProgressBar } from './ProgressBar'

/*
  HOW LONG IS LONG ENOUGH TO READ — and the numbers are researched rather than picked.

  The sources converge: a floor of about 5 seconds (6 as best practice), plus time proportional to
  the words. 200 words per minute is the usual adult prose figure, which is 300ms a word, and every
  published toast formula is a rearrangement of the same two terms — Sainsbury's works from 200wpm,
  others quote "3 seconds plus a second per three words" or "5 seconds plus one per 120 words".

  THE BASE MATTERS MORE THAN THE SLOPE. A three-word toast still needs five seconds, because the
  cost is not reading the words — it is noticing that something appeared, moving your eyes to it and
  finding your place again afterwards. That is the part a per-word rate cannot model, so it is a
  flat term rather than a multiplier.

  IT IS A BASE, NOT A FLOOR, and the first draft wrote it as both: `max(FLOOR, FLOOR + words × rate)`
  — where the second term is always the larger, so the `max` could never bind. Dead arithmetic that
  read as a safety net. Adding the base is the whole of it; the only clamp that does anything is the
  cap.

  AND THE CAP IS A DIFFERENT DECISION, not arithmetic: past about fifteen seconds a message is not a
  toast at all. It is an `Alert` in the layout, where nobody is racing it. The cap is where this
  component says so.

  Exported so it can be tested as arithmetic rather than through a rendered specimen — the move
  `Meter` made with `meterRegion` and `Alert` with `alertRole`.
*/
export const READING_BASE_MS = 5000
export const READING_PER_WORD_MS = 300
export const READING_CAP_MS = 15000

export const readingTime = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.min(READING_CAP_MS, READING_BASE_MS + words * READING_PER_WORD_MS)
}

export type ToastPlacement = 'top' | 'bottom' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

type ToastBase = {
  open: boolean
  onClose: () => void
  tone?: AlertTone
  title: string
  children?: ReactNode
  /** where in the viewport it sits. The top layer means this is the only positioning it needs */
  placement?: ToastPlacement
  style?: CSSProperties
}

/*
  THE ANNOUNCING KIND — it says something and leaves. Nothing to press, so nothing to miss, so a
  timer is safe and focus must not move.
*/
type ToastTransient = ToastBase & {
  /*
    MILLISECONDS, OR `'auto'` TO READ THE CONTENT AND WORK IT OUT.

    `'auto'` measures the RENDERED TEXT rather than the props, and that is what makes it work with a
    slot: `children` can be a paragraph, a list, a component tree, anything — none of which can be
    counted from the outside. After the toast paints, its own `textContent` is the whole message as a
    person actually sees it, so the count is taken from the DOM.
  */
  duration: number | 'auto'
  actions?: never
}

/*
  THE ASKING KIND — it holds controls, so it stays until it is dealt with. `role="dialog"` and focus
  moves to it, per the research: a notification carrying actions that nobody can reach is not a
  notification.
*/
type ToastPersistent = ToastBase & {
  duration?: never
  actions: ReactNode
}

export type ToastProps = ToastTransient | ToastPersistent

export function Toast({
  open,
  onClose,
  tone = 'info',
  title,
  children,
  actions,
  duration,
  placement = 'bottom-end',
  style,
}: ToastProps) {
  const ref = useRef<HTMLDivElement>(null)
  const transient = duration != null
  /*
    THE RESOLVED DURATION, and it starts null because it cannot be known before paint. `'auto'` needs
    the rendered text, so the first render measures and the second one runs the timer — which is also
    why the bar does not appear for a frame with nothing to count down.
  */
  const [ms, setMs] = useState<number | null>(null)
  const [left, setLeft] = useState(1)
  /* the pause, and it is the 2.2.1 mitigation rather than a nicety — see the effect below */
  const [held, setHeld] = useState(false)

  /*
    THE TOP LAYER IS ENTERED IMPERATIVELY, because that is the only way in: `popover` is an
    attribute but showing is a method. The guards matter — calling `showPopover()` on an element
    that is already showing throws, and so does hiding one that is not.
  */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) {
      if (!el.matches(':popover-open')) el.showPopover()
      /*
        FOCUS MOVES ONLY FOR THE ASKING KIND. A transient toast that stole focus would interrupt
        someone mid-sentence to tell them a thing saved; a persistent one that did not would hold a
        button nobody can reach.
      */
      if (!transient) el.focus()
    } else if (el.matches(':popover-open')) {
      el.hidePopover()
    }
  }, [open, transient])

  /*
    THE DURATION IS RESOLVED AFTER PAINT, because `'auto'` has to read what was painted. Measuring
    `textContent` catches the title, the body and anything a caller put in the slot — and it excludes
    the ✕'s accessible name, which lives in an `aria-label` rather than in the text.
  */
  useEffect(() => {
    if (!open || duration == null) {
      setMs(null)
      return
    }
    if (duration !== 'auto') {
      setMs(duration)
      return
    }
    const el = ref.current
    setMs(readingTime(el?.textContent ?? title))
  }, [open, duration, title, children])

  /*
    THE TIMER IS THE TRANSIENT KIND'S ALONE, and it is a DEADLINE rather than a countdown — a
    `setTimeout` that a pause has to cancel and restart loses whatever fraction of a tick was in
    flight, and twenty pauses lose twenty of them. Holding the remaining time and recomputing the
    deadline on resume keeps the arithmetic exact however many times it is interrupted.

    It restarts when the message changes: a second "Saved" arriving while the first is still up
    should get its own full reading time rather than inheriting the remains of the first one's.
  */
  /*
    THE REMAINING TIME LIVES IN A REF, and the first version got this wrong in a way that only shows
    up when someone actually pauses. `held` was in the dependency array, so flipping it re-ran the
    effect — and the effect declared `let remaining = ms`, which RESET the clock to full. Hovering a
    toast would have quietly given it its whole life back, every time, for as long as anyone kept
    hovering. A value that must survive a re-run cannot be a local of the thing that re-runs.
  */
  const remaining = useRef<number | null>(null)
  useEffect(() => {
    if (!open || ms == null) return
    if (remaining.current == null) remaining.current = ms
    let raf = 0
    let since = performance.now()
    const tick = (now: number) => {
      if (!held && remaining.current != null) {
        remaining.current -= now - since
        if (remaining.current <= 0) {
          onClose()
          return
        }
      }
      since = now
      setLeft(Math.max(0, (remaining.current ?? 0) / ms))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, ms, held, title, onClose])

  /*
    A FRESH MESSAGE GETS A FRESH CLOCK. The ref is cleared here rather than in the timer, because the
    timer must NOT reset it — that is the bug above. This effect is the one place a new message is
    known, so it is the one place the remaining time is allowed to go back to full.
  */
  useEffect(() => {
    remaining.current = null
    setLeft(1)
  }, [open, title, ms])

  const hold = useCallback(() => setHeld(true), [])
  const release = useCallback(() => setHeld(false), [])

  /*
    ESCAPE CLOSES THE ASKING KIND. `manual` popovers get no light dismiss and no Escape from the UA
    — that is why the mode was chosen — so the one exit a focused dialog must have is bound here.
    2.1.2: anything that takes focus has to give it back.
  */
  useEffect(() => {
    if (!open || transient) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, transient, onClose])

  return (
    <div
      ref={ref}
      /*
        SPREAD RATHER THAN WRITTEN, because `popover` is not in this React version's DOM typings —
        the same line `Popover` already carries, for the same reason, two files over.
      */
      {...({ popover: 'manual' } as { popover: string })}
      className={['nd-toast', `p-${placement}`].join(' ')}
      /*
        THE ROLE IS THE KIND'S, not the tone's, for the persistent one: a thing holding controls that
        has taken focus is a dialog, whatever it is telling you. A transient one keeps the tone's own
        live region, which is where `alertRole` earns being exported.
      */
      role={transient ? undefined : 'dialog'}
      aria-modal={transient ? undefined : false}
      aria-label={transient ? undefined : title}
      tabIndex={transient ? undefined : -1}
      /*
        HOVER AND FOCUS HOLD THE CLOCK, and this is the WCAG 2.2.1 mitigation rather than a nicety.
        A visible countdown tells someone the clock is running; it does not let them stop it, and
        2.2.1 asks for turn off, adjust or EXTEND. Reaching for the toast — with a pointer or with a
        keyboard — is the extension, and it is the gesture someone makes anyway when they want to
        read it again.

        `focus` and `blur` rather than `focusin`/`focusout` would miss a caller who put a link in the
        slot, so the capturing pair is used.
      */
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      style={style}
    >
      {/*
        THE ALERT IS THE MESSAGE. Composed rather than redrawn, so the tone ladder, the glyph, the
        dismiss and the drawing exist once. Its own live region does the announcing for the transient
        kind; for the persistent kind the dialog wrapper has already said what this is.
      */}
      {/*
        THE SURFACE IS A BOX AROUND BOTH, and it exists because the clock has to sit on the ALERT's
        bottom edge rather than the toast's. Rendered as a sibling of the alert, the countdown
        positioned against the toast instead — measured, it overhung by 15px on every side, which is
        exactly the toast's own padding, and `border-radius: inherit` picked up the toast's zero
        rather than the alert's corner.

        A wrapper that is the alert's box solves both at once: the clock's `inset` now means the
        alert's edges, and the wrapper's `overflow: hidden` clips the bar into the corner. It also
        carries the lift, because a box that clips cannot cast a shadow past its own edge.
      */}
      <span className="nd-toast-surface">
        <Alert
          tone={tone}
          title={title}
          actions={actions}
          onDismiss={onClose}
          dismissLabel={`Dismiss: ${title}`}
          style={{ inlineSize: '100%' }}
        >
          {children}
        </Alert>
      {/*
        A TRANSIENT TOAST ANNOUNCES THROUGH THE ALERT'S OWN ROLE, which `alertRole` derives from the
        tone. Stated here so the reason is visible at the place someone would otherwise add a second
        live region and end up with the message read twice.
      */}
      {/*
        THE COUNTDOWN, AND IT IS `aria-hidden` FOR A REASON THAT IS NOT COSMETIC. This bar sits
        inside a live region — the transient toast's `Alert` is `role="status"` — and a native
        `<progress>` whose value changes sixty times a second inside one is a screen reader reading
        the same message over and over. The bar is for eyes; the live region is for ears; they are
        reporting the same fact and only one of them should say it.

        IT IS THE KIT'S OWN `ProgressBar`, not a div with a width. A thing that shows a fraction is
        exactly what that component is, and using anything else here would be the kit declining to
        eat its own cooking in the one place a reviewer will look.
      */}
        {transient && ms != null && (
          <span className="nd-toast-clock" aria-hidden>
            <ProgressBar label="Time remaining" labelHidden size="small" value={Math.round(left * 100)} />
          </span>
        )}
      </span>
      <span hidden data-toast-live={transient ? alertRole(tone) : 'dialog'} />
    </div>
  )
}
