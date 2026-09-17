/*
  Dialog — the platform does the hard half, which is the whole argument for using its element.

  MEASURED BEFORE ANYTHING WAS WRITTEN. `<dialog>` with `showModal()` gives, with nothing written
  here at all:

    role="dialog"        implicit — `getAttribute('role')` is null
    the top layer        `:modal` matches
    a focus trap         focus moves inside, and a button OUTSIDE cannot be focused
    an inert backdrop    everything behind it stops responding
    Escape               closes it, and fires `cancel` first so it can be refused
    focus return         back to whatever opened it

  That is the entire difficult part of the pattern. The hand-rolled dialog in the deleted board
  app was a `<div role="dialog">` inside a scrim div and had NONE of it: nothing trapped, nothing
  behind it inert, focus never returned, the scrim drawn by hand — the default state of every
  `<div role="dialog">` until someone writes the trap.

  THE TWO MODES ARE GENUINELY DIFFERENT ELEMENTS' WORTH OF BEHAVIOUR, and `show()` was measured
  too: NOT in the top layer, no trap, the outside still reachable, and `position: absolute`. So a
  non-modal dialog is a free-floating panel that happens to manage its own open state — useful,
  and much less than the modal case gives.

  WHICH RAISES THE OVERLAP, AND IT IS WORTH SAYING PLAINLY: a non-modal Dialog and a `Popover` do
  similar things. The line is ANCHORING. A Popover hangs off an element and flips and shifts to
  stay in the viewport; a non-modal Dialog hangs off nothing and sits where the layout puts it. If
  the surface belongs to a trigger, it is a Popover. If it is a window, it is a Dialog.

  ESCAPE IS THE MODAL'S ALONE. The platform closes a modal dialog on Escape and does not close a
  non-modal one — so the non-modal case gets a key handler of its own, and that asymmetry is the
  platform's rather than this component's.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useEffect, useId, useRef } from 'react'
import { Button } from './Button'
import { DismissIcon } from './Icon'
import { FormActionsHostContext } from './FormGrid'

/*
  THREE WIDTHS, AND THEY ARE ABOUT CONTENT rather than about the viewport. `small` is a
  confirmation — one sentence and two buttons. `medium` is a form. `large` is a working surface
  that happens to be modal. All three cap on the viewport, because a dialog taller than the screen
  is a dialog whose actions cannot be reached.
*/
export type DialogSize = 'small' | 'medium' | 'large'

/*
  A DIALOG MUST HAVE A VISIBLE WAY OUT, AND THE TYPE IS WHAT ENFORCES IT.

  THE ACCESSIBILITY QUESTION IS NOT "DOES IT NEED A ×". WCAG 2.1.2 (No Keyboard Trap) is satisfied
  by Escape, so a keyboard user is never trapped — but there is NO ESCAPE KEY ON TOUCH, and the
  backdrop press is undiscoverable. A modal whose only exits are Escape and the backdrop passes
  2.1.1 on a technicality and strands a phone user in practice. Escape is also invisible, which is
  the cognitive-accessibility half of the same point.

  So the rule is "never zero visible exits", and a footer `Cancel` satisfies it exactly as well as
  a header ×. Requiring the × specifically would be wrong.

  AND THERE IS A CASE WHERE THE × IS ACTIVELY HARMFUL: a dialog demanding a decision — save or
  discard — should not have one, because it invents an ambiguous third outcome. That is also the
  case where Escape and the backdrop press must go: an invisible escape hatch out of a mandatory
  decision is worse than no × at all.

  THE UNION BELOW MAKES THE BAD STATE UNWRITABLE. Dismissible is the default and renders the ×;
  turning it off REQUIRES `actions`, so the one dialog that cannot be built is the one with no way
  out.
*/
type DialogBase = {
  open: boolean
  /*
    FIRED FOR ESCAPE, FOR THE BACKDROP, AND FOR THE CLOSE BUTTON — the caller owns the state, as
    everywhere else in this kit. `cancel` is intercepted so a dialog CAN refuse to close, which is
    what an unsaved form needs; the caller expresses that by simply not changing `open`.
  */
  onClose: () => void
  /*
    REQUIRED, AND IT IS THE ACCESSIBLE NAME. A dialog announces itself by its title, and this kit
    has made a nameless anything unwritable everywhere else. `aria-labelledby` points at the real
    heading rather than duplicating it into an `aria-label`.
  */
  title: string
  /** the body — anything at all */
  children: ReactNode
  /*
    the footer row. Buttons, usually; the component only lays them out — and they are `small`,
    the same rule as Alert's actions slot: the host's own chrome is the 24px rung, and a footer
    that outweighs its ✕ reads as content rather than as controls. The body is free; the footer
    is chrome. node-kit-test sweeps the stories for both hosts.
  */
  actions?: ReactNode
  /*
    MODAL BY DEFAULT, because the modal case is the one the platform helps with. Non-modal keeps
    the element and loses the trap, the inert backdrop and Escape — see the header.
  */
  modal?: boolean
  size?: DialogSize
  /** a line under the title — what this dialog is for */
  description?: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/* the ordinary dialog: a × in the header, Escape, and a backdrop press. `actions` is optional
   because the × is already the visible exit */
type DialogDismissible = DialogBase & { dismissible?: true; actions?: ReactNode }
/*
  THE DECISION DIALOG: no ×, no Escape, no backdrop press — so `actions` is REQUIRED, because they
  become the only way out. This is the shape that makes "a dialog with no exit" unwritable.
*/
type DialogRequired = DialogBase & { dismissible: false; actions: ReactNode }

export type DialogProps = DialogDismissible | DialogRequired

export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog(props, ref) {
  const { open, onClose, title, children, actions, modal = true, size = 'medium', description, style } = props
  const dismissible = props.dismissible !== false
  /*
    A MUTABLE REF, DELIBERATELY. `useRef<T>(null)` types `current` as READ-ONLY when the initial
    value is null and the ref is meant for JSX — and this one is also written by hand in the merged
    callback below, which is how `Button`'s ref merge works too.
  */
  const own = useRef<HTMLDialogElement | null>(null)
  const id = useId()

  /*
    OPENED AND CLOSED THROUGH THE ELEMENT'S OWN METHODS, not by rendering it or not. `showModal()`
    is what puts it in the top layer and starts the trap; an element rendered with the `open`
    attribute is open WITHOUT any of that — the single most common way a `<dialog>` ends up with
    none of the behaviour it was chosen for.
  */
  useEffect(() => {
    const el = own.current
    if (!el) return
    if (open && !el.open) {
      if (modal) el.showModal()
      else el.show()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open, modal])

  /*
    THE PLATFORM'S ESCAPE IS INTERCEPTED RATHER THAN ALLOWED. `cancel` fires before the element
    closes itself, so preventing it and calling `onClose` keeps the caller as the only thing that
    decides whether the dialog is open — which is what lets a dialog refuse to close.

    Without this the element would close itself while `open` stayed true, and the next render
    would find them disagreeing.
  */
  useEffect(() => {
    const el = own.current
    if (!el) return
    const onCancel = (e: Event) => {
      /*
        ALWAYS PREVENTED, so the element never closes itself behind the caller's back. On a dialog
        that is NOT dismissible the cancel is simply swallowed — which is what stops Escape working
        on a decision dialog rather than leaving an invisible hatch out of it.
      */
      e.preventDefault()
      if (dismissible) onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose, dismissible])

  /*
    …AND A NON-MODAL ONE GETS ESCAPE WRITTEN BY HAND, because the platform does not give it one.
    Measured: `show()` produces no trap, no inert backdrop and no Escape. The asymmetry is the
    platform's; what this kit refuses is to let it show through as one mode being dismissible and
    the other not.
  */
  useEffect(() => {
    if (!open || modal || !dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, modal, dismissible, onClose])

  return (
    <dialog
      ref={(node) => {
        own.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      className={['nd-dialog', `s-${size}`, modal ? 'is-modal' : 'is-modeless'].join(' ')}
      /* the same island a Popover is — see Popover.tsx */
      data-level={4}
      /* OPAQUE BY DESIGN, and it says so on the axis that decides materials. This surface
         painted the solid `--surface` before the fills collapsed into one name; now
         `--background` is glass at three rungs of four, and a panel that frosts nothing must
         declare the material rather than rely on which rung it happens to land on. */
      data-surface="normal"
      aria-labelledby={`${id}-title`}
      {...(description ? { 'aria-describedby': `${id}-desc` } : {})}
      style={style}
      /*
        A PRESS ON THE BACKDROP CLOSES IT, and the check is geometric rather than a scrim element.
        `::backdrop` is not a node, so there is nothing to attach a handler to — but a click that
        lands on the dialog element itself, outside its own content box, IS a backdrop click.
        The hand-rolled dialog this replaced needed a whole extra div for this.
      */
      onClick={(e) => {
        if (!modal || !dismissible || e.target !== e.currentTarget) return
        const r = (e.currentTarget as HTMLDialogElement).getBoundingClientRect()
        const outside =
          e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
        if (outside) onClose()
      }}
    >
      {/*
        THE WHOLE CONTENT IS ONE BOX INSIDE THE ELEMENT, so the backdrop test above has something
        to compare against: a press on the dialog element that is NOT on this box is a press on the
        space around it.
      */}
      <div className="nd-dialog-body">
        <div className="nd-dialog-head">
          <h2 className="nd-dialog-title" id={`${id}-title`}>
            {title}
          </h2>
          {/*
            THE × IS THE DEFAULT VISIBLE EXIT, and it is `Button`'s small square rung — 24px, which
            IS `spacing.group.target.minimum`. The one control a stranded touch user reaches for is
            never under the minimum target.
          */}
          {dismissible && (
            <span className="nd-dialog-close">
              <Button
                variant="ghost"
                kind="icon-button"
                size="small"
                glass={false}
                label="Close"
                leading={<DismissIcon />}
                onClick={onClose}
              />
            </span>
          )}
          {description != null && description !== false && (
            <p className="nd-dialog-desc" id={`${id}-desc`}>
              {description}
            </p>
          )}
        </div>
        {/* a form in this dialog yields its action row to `actions` (SECTION-RULES a11);
            FormActions reads this and refuses to draw a second footer */}
        <FormActionsHostContext.Provider value={actions != null && actions !== false}>
          <div className="nd-dialog-content">{children}</div>
        </FormActionsHostContext.Provider>
        {actions != null && actions !== false && <div className="nd-dialog-actions">{actions}</div>}
      </div>
    </dialog>
  )
})
