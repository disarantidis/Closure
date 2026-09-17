/*
  Stepper — a sequence with NAMES, where a bar has only an amount.

  THE KIT NOW HAS THREE WAYS TO SHOW PROGRESS AND THEY ARE NOT INTERCHANGEABLE:

    ProgressBar   a continuous edge   how far along one operation is, or that it is working
    Meter         a continuous edge   where a quantity sits inside a range
    Stepper       DISCRETE, ORDERED   which part you are in, and what the parts are

  A bar can say 60%. Only a stepper can say "Semantics, after Palette, before Preview" — the
  steps have identity, and identity is the whole reason to reach for one. If the parts have no
  names, a bar is the honest component.

  RESEARCHED THROUGH ASTRYX FIRST, WHICH SHIPS NOTHING HERE. `astryx search stepper`, `wizard`
  and `step progress` across 149 components return NumberInput, Breadcrumbs and a fullscreen
  Dialog template that mentions multi-step wizards as a use case. Carbon's ProgressIndicator,
  Ant's Steps and Atlassian's Progress tracker are the peers that do ship one, and Material
  DROPPED its Stepper between M2 and M3 — several major systems carry none at all. What the
  ones that do agree on is narrower than it looks: an ordered list of named steps, each in one
  of four states, one of which is an error. Dots, numbers, connectors and editability are
  decoration on that.

  THE PATTERN IS AN ORDERED LIST, NOT A PROGRESSBAR AND NOT TABS. APG has no stepper pattern,
  so the real decision is WHICH existing pattern this is, and there are only three candidates:

    role="progressbar"   claims a percentage of one operation — steps are discrete and named
    role="tablist"       claims panels switchable in any order — a sequence has a direction
    <nav><ol> + aria-current="step"    an ordered list where one item is the current one

  The third is what `aria-current`'s `step` token was minted for. Verified in the browser before
  this was written: it reflects as `"step"` off `Element.prototype.ariaCurrent`, so the UA
  understands it rather than carrying it as an unknown attribute.

  VERTICAL FIRST, AND THAT IS A MEASUREMENT RATHER THAN A TASTE. Every panel in the board app
  this kit grew out of was 280–300px wide, and a horizontal stepper with named steps fits about
  two of them. The app is gone; the measurement stands for any side panel of that class.
  Horizontal is the second axis, not the default to guess at.
*/
import type { CSSProperties, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { forwardRef } from 'react'
import type { ProgressSize } from './ProgressBar'
import { ConfirmIcon, DismissIcon } from './Icon'
import { Spinner } from './Spinner'
import { ProgressBar } from './ProgressBar'

/*
  THE SAME THREE RUNGS AS THE BARS, ALIASED RATHER THAN RETYPED — §25's rule. What differs is
  what the rung sizes: a bar's rung is a track thickness, a stepper's is the MARKER, which takes
  three real spacing rungs that other components already stand at (16 is Badge, 22 is Avatar's
  small). The type climbs Button's ladder as everything in this kit does.
*/
export type StepperSize = ProgressSize

/*
  BOTH AXES NOW, AND VERTICAL IS STILL THE ONE THAT FITS THIS APP. Every panel here is 280-300px
  wide, which holds about two named steps side by side — so `horizontal` is for the wide surfaces
  (a full-width form, a dialog, a page header) and the caller has to have the room. It is not a
  free switch: a horizontal stepper gives each step an EQUAL COLUMN, so the widest label sets the
  width of every column and a long one wraps rather than pushing its neighbours.
*/
export type StepperOrientation = 'vertical' | 'horizontal'

/*
  FOUR STATES, AND THREE OF THEM ARE DERIVED. The caller says WHERE it is (`current`) and WHICH
  step failed (`error` on the step); complete/current/upcoming fall out of the index. That is
  this kit's oldest rule — derived, never declared — and it removes the state a caller can most
  easily contradict: a step marked `complete` that sits after the current one.

  ERROR IS THE EXCEPTION BECAUSE FAILURE IS NOT POSITIONAL. Step 2 can have failed while you are
  standing on step 3, so it cannot be worked out from an index and has to be said.
*/
export type StepState = 'complete' | 'current' | 'upcoming' | 'loading' | 'error'

export type Step = {
  /** stable across reorders — React's key, and the hit layer's id */
  id: string
  label: string
  /*
    THE BODY IS A SLOT AND TAKES ANYTHING — a line of text, a Meter, a row of Tags, a thumbnail.
    It was a string-only `hint`; the same widening `foot` got on ProgressBar, and for the same
    reason: the component has no business deciding that what goes under a step's name is prose.

    `label` stays a string and stays required. It is the step's NAME — what the hit layer
    announces and what a reader hears — and it renders outside this slot, so no amount of
    content in here can get into it.
  */
  content?: ReactNode
  /*
    THIS STEP IS WORKING. Declared, like `error`, because "in progress" is not derivable from an
    index either — the step you are STANDING on and the step that is BUSY are different
    questions, and a background step can be busy while you look at another one. It outranks the
    positional states and is outranked by `error`: a step that failed is no longer loading.
  */
  loading?: boolean
  /*
    THE HANDLER IS WHAT MAKES A STEP NAVIGABLE. There is no `interactive` flag and no
    `variant="clickable"` — a step with an `onClick` becomes a button, a step without one is
    text, and the two cases cannot disagree with each other. Button, Chip and ListItem all
    derive interactivity the same way.
  */
  onClick?: () => void
  /** this step failed. Not derivable from an index — see StepState */
  error?: boolean
  /** reachable later, but not now — a step whose prerequisites are unmet */
  disabled?: boolean
  /** a Badge, a Tag, a count — beside the label, and never a second target */
  trailing?: ReactNode
  /*
    THE LINE LEAVING THIS STEP, CARRYING A VALUE — 0 to 100, and the connector becomes a real bar.

    IT IS A ProgressBar, REUSED WHOLE, not a second drawing of one. The connector is normally a
    `::before`, which is not a DOM node and so can hold decoration but never information; a value
    needs an element, a name and a role, and the kit already has the component that has all three.
    Passing `labelHidden` and `showValue` gives exactly the two parts wanted — the track, and the
    number beside it — and the vertical axis comes with it.

    THE SEGMENT BELONGS TO THE STEP IT LEAVES. "62" on step 3 means step 3 is 62% done, drawn on
    the line running out of it. Stating that is the whole reason it is a per-step prop rather than
    something the stepper works out: a value floating between two markers has no owner, and every
    reader would assign it a different one.

    AND THE GAP OPENS TO MAKE ROOM. Measured before this existed: a vertical connector is 35px at
    the default spacing, which draws a 22px stub that reads as a tick rather than a measurement. A
    step whose segment carries a value therefore takes more room — derived from the value being
    there, not asked of the caller.
  */
  segment?: number
}

export type StepperProps = {
  /*
    THE NAV NEEDS A NAME, and it is required for the same reason every other name in this kit
    is: a page with two step sequences and no names on them announces "navigation" twice.
  */
  label: string
  steps: Step[]
  /** the index you are standing on. Everything except `error` follows from it */
  current: number
  size?: StepperSize
  orientation?: StepperOrientation
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  THE STATE WORDS ARE PART OF THE COMPONENT, NOT PART OF THE STYLING. The marker draws a tick, a
  number or a cross and is `aria-hidden` — it is a picture of the state, and a picture is not a
  reading. `aria-current="step"` covers the current one; the other three have no ARIA of their
  own, so each step carries a visually-hidden word. Without it a screen reader hears four
  identical items and the whole component says nothing it did not already know from the labels.
*/
const STATE_WORD: Record<StepState, string> = {
  complete: 'completed',
  current: 'current step',
  upcoming: 'not started',
  loading: 'in progress',
  error: 'failed',
}

export const Stepper = forwardRef<HTMLElement, StepperProps>(function Stepper(
  { label, steps, current, size = 'medium', orientation = 'vertical', style },
  ref
) {
  return (
    <nav
      ref={ref}
      className={['nd-stepper', `s-${size}`, `o-${orientation}`].join(' ')}
      aria-label={label}
      style={style}
    >
      <ol className="nd-stepper-list">
        {steps.map((step, i) => {
          /*
            THE DERIVATION, IN ONE LINE AND IN THIS ORDER. `error` outranks everything because a
            failed step stays failed whether you have moved past it or not; `loading` outranks the
            positional three because "busy" is a thing happening TO a step rather than a place in
            the sequence. Only the last three fall out of the index.
          */
          const state: StepState = step.error
            ? 'error'
            : step.loading
              ? 'loading'
              : i < current
                ? 'complete'
                : i === current
                  ? 'current'
                  : 'upcoming'
          /*
            WHERE YOU ARE AND WHAT IS HAPPENING THERE ARE DIFFERENT QUESTIONS, so `aria-current`
            is read off the INDEX rather than off the derived state. The first draft tied it to
            `state === 'current'`, which silently dropped it the moment the step you were standing
            on started loading or failed — the two cases where a reader most needs to be told
            where they are.
          */
          const here = i === current
          const clickable = !!step.onClick && !step.disabled
          const hitId = `${step.id}-hit`
          /* the last step has no line leaving it, so it can carry no segment either */
          const segment = i < steps.length - 1 && step.segment != null ? step.segment : undefined
          return (
            <li
              key={step.id}
              className={[
                'nd-step',
                `is-${state}`,
                step.disabled ? 'is-disabled' : '',
                clickable ? 'is-clickable' : '',
                segment != null ? 'has-segment' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              /*
                THE TONE IS A SCHEME, as it is for ProgressBar's endings and Meter's regions.
                A failed step is this step inside `data-scheme="error"` — no red named here, and
                the marker, the label, the hint and the connector all repaint together in
                whichever theme is running.
              */
              data-scheme={state === 'error' ? 'error' : undefined}
              /* the platform's own word for "this is being updated" — it belongs on the region
                 that is changing, which is the step rather than the whole list */
              aria-busy={state === 'loading' || undefined}
              /* a clickable step lifts one rung under the pointer — LevelContext.tsx */
              data-fill={fieldLevel(useLevel())}
            >
              {/*
                THE HIT LAYER — ListItem's invisible-button pattern, and it is here for exactly
                the reason it is there. A step may hold a Badge in `trailing`; wrapping the row's
                content in the button would make that a control inside a control, which is the
                double-target this kit refuses. So the button is EMPTY and stretched, the content
                is its SIBLING, and the press always belongs to the step.
              */}
              {clickable && (
                <button type="button" id={hitId} className="nd-step-hit" onClick={step.onClick}>
                  <span className="nd-step-a11y">
                    {step.label}, {STATE_WORD[state]}
                  </span>
                </button>
              )}
              <span
                className="nd-step-marker"
                /* the accent pole — a complete or errored marker is an accent surface */
                data-tense={state === 'complete' || state === 'error' ? 'strong' : undefined}
                aria-hidden
                /* the marker is a PICTURE of the state — the reading is the hidden word below */
              >
                {/*
                  THE SPINNER IS THE KIT'S OWN, not a second drawing of the same idea. It is
                  sized by the marker's `> svg` rule rather than by its `size` prop — CSS beats a
                  presentational attribute — so it follows the rung like every other glyph here.
                  `label=""` because the step already announces "in progress": a Spinner with a
                  name of its own would be the second reading of one state.
                */}
                {state === 'complete' ? (
                  <ConfirmIcon />
                ) : state === 'error' ? (
                  <DismissIcon />
                ) : state === 'loading' ? (
                  <Spinner label="" strokeWidth={4} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="nd-step-text">
                <span className="nd-step-label" {...(here ? { 'aria-current': 'step' as const } : {})}>
                  {step.label}
                  {/* the state, for a reader that cannot see the marker. On a clickable step the
                      hit layer already says it, so this would be the second copy */}
                  {!clickable && <span className="nd-step-a11y">, {STATE_WORD[state]}</span>}
                </span>
                {step.content != null && step.content !== false && <span className="nd-step-content">{step.content}</span>}
              </span>
              {step.trailing != null && step.trailing !== false && <span className="nd-step-slot">{step.trailing}</span>}
              {/*
                THE VALUED CONNECTOR. It replaces the `::before` rather than joining it — two
                lines in one channel would be a bar with a hairline through it.

                `labelHidden` and `showValue` are what turn the full component into the two parts
                a connector wants: the track, and the number beside it. The name is DERIVED from
                the step's own, so a segment can never be nameless and the caller never has to
                write a second label for something they already named.
              */}
              {segment != null && (
                <span className="nd-step-seg">
                  <ProgressBar
                    label={`${step.label} progress`}
                    labelHidden
                    showValue
                    value={segment}
                    size={size}
                    orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
                  />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
})
