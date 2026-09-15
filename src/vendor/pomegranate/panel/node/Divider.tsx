/*
  Divider — one hairline, where the board app this kit grew out of held five.

  THE COUNT WAS THE ARGUMENT. Twenty-four `border-top` declarations in that app's stylesheet
  (deleted with it), and once the node accents and the wire edges were set aside, fifteen of
  them were genuinely dividers:

     9 ×  1px solid var(--stroke)                                    already right
     6 ×  1px solid color-mix(in srgb, var(--text) N%, transparent)   N = 8, 9, 10, 10, 12

  Five different opinions about what a hairline is, none of them agreeing with the token that
  exists for exactly this. That is what a component fixes — not the drawing, which is one line,
  but the fact that the drawing is a DECISION and the decision was taken five times.

  IT IS AN `<hr>`, WHICH IS THE PLATFORM'S THEMATIC BREAK. Verified rather than assumed: the
  element carries `role="separator"` implicitly — nothing written — and `aria-orientation` reflects,
  so a vertical one can say so. The UA's own `1px inset` border is the only thing to undo.

  AND MOST DIVIDERS SHOULD NOT BE ANNOUNCED, which is the part every peer misses. `Astryx`'s
  Divider has `orientation`, `label`, `variant` and `isFullBleed`, and no way to say "this is a
  picture". A separator between two genuinely distinct sections is worth announcing; fifteen
  hairlines inside one panel are fifteen "separator"s a screen-reader user has to listen through.
  So `decorative` demotes it to `role="presentation"` — measured to take, and the same demotion
  `Avatar` makes when a row's title already IS the name.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef } from 'react'

/*
  TWO WEIGHTS, AND BOTH ARE TOKENS THE FOUNDATION ALREADY SHIPS. `subtle` is the quiet rule
  between related things; `strong` is a real boundary. There is no third, because a divider that
  needs a third weight is a divider doing a container's job.
*/
export type DividerWeight = 'subtle' | 'strong'
export type DividerOrientation = 'horizontal' | 'vertical'

export type DividerProps = {
  orientation?: DividerOrientation
  weight?: DividerWeight
  /*
    A LABEL TURNS THE RULE INTO A HEADING, and changes the markup: an `<hr>` cannot contain
    anything, so a labelled divider is a `role="separator"` box with the rule drawn either side of
    its text. The board app wrote this pattern by hand — a `border-top` with a heading under
    it — in two pieces that did not know they belonged together.
  */
  label?: ReactNode
  /*
    OUT OF THE TREE, BECAUSE MOST OF THEM ARE PICTURES. A separator is announced; fifteen in one
    panel are noise. Labelled dividers are never decorative — the label is the point.
  */
  decorative?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

export const Divider = forwardRef<HTMLElement, DividerProps>(function Divider(
  { orientation = 'horizontal', weight = 'subtle', label, decorative = false, style },
  ref
) {
  const cls = ['nd-divider', `o-${orientation}`, `w-${weight}`].join(' ')

  /*
    NO LABEL IS THE `<hr>` CASE, and it is the one worth keeping native: the element already means
    "thematic break" and already carries the role, so there is nothing to write but the drawing.
    `aria-orientation` has to be said for a vertical one — `<hr>`'s implicit value is horizontal.
  */
  if (label == null || label === false) {
    return (
      <hr
        ref={ref as React.Ref<HTMLHRElement>}
        className={cls}
        style={style}
        {...(decorative ? { role: 'presentation' } : {})}
        {...(orientation === 'vertical' && !decorative ? { 'aria-orientation': 'vertical' as const } : {})}
      />
    )
  }

  /*
    A LABELLED DIVIDER CANNOT BE AN `<hr>` — the element is void. So the role is written by hand
    here, which is the one place in this component that happens, and the rules are drawn by the
    box rather than by an element of their own.

    `separator` IS NOT A NAME-FROM-CONTENT ROLE, so the text inside does not become the accessible
    name on its own. When the label is a plain string it is passed as `aria-label`; when it is a
    node, the caller owns the naming — the same division `Tooltip` draws with `text: string`.
  */
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={`${cls} has-label`}
      role="separator"
      aria-orientation={orientation}
      {...(typeof label === 'string' ? { 'aria-label': label } : {})}
      style={style}
    >
      <span className="nd-divider-label">{label}</span>
    </div>
  )
})
