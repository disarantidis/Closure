/*
  InteractiveCard — a card whose whole box is a target: a link, a trigger, whatever you wire it to.

  SPLIT OUT OF `Card`, WHICH IS NOW PURELY STATIC. The two used to be one component that DERIVED its
  interactivity from whether you passed `onClick`/`href`. They are separate components now, so each
  name says exactly what it is: `Card` is a container, `InteractiveCard` is a control,
  `SelectableCard` is a choice. It reads the same surface (`.nd-card`, its size, level and glass), so
  a static card and an interactive one of the same size are the same box — one just answers a press.

  A TARGET MUST BE NAMED. A card whose whole box is pressable is a control, and a control with no
  name is the unwritable thing this kit refuses everywhere else. `label` is required BY THE TYPE, not
  asked for in the docs — the pressable and link shapes both demand it.

  THE HIT LAYER — `ListItem`'s invisible-button pattern. A card routinely holds a Button, a Tag or a
  link; wrapping the content in the target would make each of those a control inside a control, which
  is the double-fire measured on Menu: one press, two handlers. So the target is EMPTY and stretched,
  the content is its SIBLING, and anything genuinely operable inside takes its events back and rises
  above it (`.nd-card.is-target :is(button, a, …):not(.nd-card-hit)`). That is what makes "nested
  interactive elements work independently" true rather than asserted: press the card, the card fires;
  press an inner button, only the button does.

  NEVER NEST TWO TARGETS. A static `Card` inside anything is fine; an `InteractiveCard` inside
  another target is the double-fire above, and a tab stop inside a tab stop. Read-only content nests
  freely — a target does not.
*/
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { LevelContext, useLevel } from './LevelContext'
import { forwardRef } from 'react'
import type { CardSize, CardLevel } from './Card'
import { resolveCardChildren } from './Card'

type Base = {
  size?: CardSize
  children: ReactNode
  /** which container rung fills it — see `CardLevel` */
  level?: CardLevel
  /** frost what is behind the card — see `Card`'s note; off by default */
  blur?: boolean
  /** which pole the card stands on — see Card's note: it must be a prop, because a card that
      names its own `level` re-grounds itself and a strong ancestor never reaches it */
  tense?: 'tonal' | 'strong'
  /** the accessible name — required, because the whole box is a control */
  label: string
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}
/* a trigger — the whole box calls `onClick` */
type Pressable = Base & { onClick: (e: ReactMouseEvent) => void; href?: never }
/* a link — the whole box is a real `<a>`, so it opens in a tab, copies, and is crawlable */
type Link = Base & { href: string; onClick?: never }

export type InteractiveCardProps = Pressable | Link

export const InteractiveCard = forwardRef<HTMLDivElement, InteractiveCardProps>(function InteractiveCard(props, ref) {
  const { size = 'medium', level, blur = false, tense, children, style, label } = props
  const inherited = useLevel()
  const onClick = 'onClick' in props ? props.onClick : undefined
  const href = 'href' in props ? props.href : undefined

  const className = ['nd-card', `s-${size}`, level ? `u-${level}` : '', blur ? 'is-glass' : '', 'is-target']
    .filter(Boolean)
    .join(' ')

  /* same level-island behaviour as Card — see Card.tsx's comment on data-level, and
     LevelContext.tsx on why the level travels in React as well as in CSS */
  const ground = level ?? inherited

  return (
    <LevelContext.Provider value={ground}>
    <div ref={ref} className={className} data-level={level}
      data-tense={tense === 'strong' ? 'strong' : undefined} style={style}>
      {href ? (
        <a className="nd-card-hit" href={href} aria-label={label}>
          {/* the anchor has no text of its own — this names it for a reader */}
          <span className="nd-card-a11y">{label}</span>
        </a>
      ) : (
        <button type="button" className="nd-card-hit" onClick={onClick} aria-label={label} />
      )}
      {/* same slot resolver as Card — see Card.tsx's `resolveCardChildren`: plain
          children auto-wrap in a CardBody, explicit CardBody/CardCanvas pass through */}
      {resolveCardChildren(children)}
    </div>
    </LevelContext.Provider>
  )
})
