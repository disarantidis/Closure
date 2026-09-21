/*
  FormGrid — the two legal form layouts, and the action row that closes them.

  LAYOUT-RULES HELD THIS RULE ALONE FOR A RELEASE. "The two legal layouts are the consuming
  layout's to build out of spacing, and this document is the only thing holding them" — and
  the 2026-09-07 census found what a rule held by a document alone produces: the ledger
  carried two byte-identical form grids under two names (`.client-form`, `.import-form`),
  the wide cell spelled two ways (`is-wide` and an inline `gridColumn: '1 / -1'`), and the
  action row hand-typed as `nd-row is-actions` at 24 sites in 13 files — left-aligned on
  one page and right-aligned on another for the same affordance. The document said a
  primitive would follow "only if a second consumer draws the hole again"; the site's forms
  are bespoke throughout. This is the primitive.

  ONE TRACK COUNT, CHOSEN ONCE. `layout` is `stacked` (one track, every field spans it) or
  `paired` (two, filled in reading order); a field that must span both tracks in a paired
  form is wrapped in `FormWide` — the odd last field, a text area, a full-width picker. A
  paired form STACKS BELOW 36rem OF ITS OWN CONTAINER (RESPONSIVE-RULES a3): the host
  declares `container-type: inline-size` and the grid queries it, so the same form pairs in
  a main column and stacks in a sidebar without knowing which it is in, and no component
  carries a width `@media`.

  THE ACTION ROW IS ITS OWN ROW, LAST, AT THE END EDGE. `FormActions` spans the form,
  aligns its buttons to the end, gaps them at `component-2`, and takes dismiss before
  commit — the terminal action at the terminal corner (SECTION-RULES C.5). Its buttons are
  at a BUTTON rung, never the field rung; node-kit-test §47 refuses the forward.

  …AND IT CANNOT APPEAR INSIDE A DIALOG THAT HAS ITS OWN. A form in a dialog yields its
  action row to the dialog's `actions` (SECTION-RULES a11); two footers in one dialog was
  the ledger's `RevisionsPanel.tsx:151` beside `DataPanel.tsx:317`. `Dialog` publishes
  whether it carries `actions`; a `FormActions` rendered under one throws, because a
  second footer is not a style choice a caller should be able to make quietly. This is
  COMPOSITION-RULES C.3 done at runtime where the type cannot see across the boundary.
*/
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createContext, forwardRef, useContext } from 'react'

export type FormLayout = 'stacked' | 'paired'

export type FormGridProps = {
  /** `stacked` — one track, every field spans it; `paired` — two tracks filled in reading order, stacking below 36rem of the form's own width */
  layout: FormLayout
  /** the form's submit — the commit button in `FormActions` is `type="submit"` and this receives it. Absent, the grid is a `div` and the buttons are the caller's */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  THE HOST IS THE CONTAINER, THE GRID QUERIES IT. A container cannot query itself, so the
  `<form>` is the host (`container-type: inline-size`) and the tracks live one element in.
*/
export const FormGrid = forwardRef<HTMLFormElement, FormGridProps>(function FormGrid({ layout, onSubmit, children, style }, ref) {
  const inner = <div className={`nd-form l-${layout}`}>{children}</div>
  return onSubmit ? (
    <form ref={ref} className="nd-formhost" onSubmit={onSubmit} style={style}>
      {inner}
    </form>
  ) : (
    <div ref={ref as React.Ref<HTMLDivElement>} className="nd-formhost" style={style}>
      {inner}
    </div>
  )
})

/** a cell that spans both tracks of a paired form — the odd last field, a text area, a full-width picker. In a stacked form it is a no-op */
export const FormWide = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div className="nd-form-wide" style={style}>
    {children}
  </div>
)

/*
  PUBLISHED BY `Dialog` WHEN IT CARRIES `actions`, read by `FormActions`. The default is
  false — a form on a page owns its own row.
*/
export const FormActionsHostContext = createContext<boolean>(false)

export type FormActionsProps = {
  /** the buttons — dismiss, then the commit, at a button rung (never `fieldRung`) */
  children: ReactNode
  /** placement only */
  style?: CSSProperties
}

export const FormActions = ({ children, style }: FormActionsProps) => {
  const hostHasFooter = useContext(FormActionsHostContext)
  if (hostHasFooter)
    throw new Error(
      'FormActions inside a Dialog that has `actions`: a form in a dialog yields its action row to the dialog\'s footer (SECTION-RULES a11) — pass the buttons to the Dialog instead'
    )
  return (
    <div className="nd-form-actions" style={style}>
      {children}
    </div>
  )
}
