/*
  Card — the static surface: a container with a content slot, and nothing that makes it a target.

  THREE CARDS, THREE JOBS, THREE COMPONENTS — never one component with a mode.

    · `Card`             a static container. Not clickable itself; it holds content, and that
                         content MAY include buttons, links and other interactive things. This is
                         the surface the other two are built to feel like.
    · `InteractiveCard`  a card whose whole box is a target — a link, a trigger, whatever it is
                         wired to. It carries the hit layer; `Card` does not.
    · `SelectableCard`   a card that is a choice: a selected state and a Radio / Checkbox / Switch
                         mark that follows it.

  `NodeCard` IS NONE OF THESE — it is the canvas node (`position: absolute`, x/y, a NodeKind, ports,
  a kind-coloured border), so it keeps its own name and `.nd-card` is the general surface beside it.

  RESEARCHED THROUGH ASTRYX (Card / ClickableCard / SelectableCard) and Carbon's Tile family, which
  splits it five ways. Two of their rules are taken wholesale:

    "COULD YOU REORDER OR REMOVE THIS INDEPENDENTLY?" If not, it is not a card — it is a section,
    and spacing and a heading will group it without drawing a box round it. Cards are the
    exception, not the default layout tool.

    SELECTION, NAVIGATION AND A PLAIN CONTAINER ARE DIFFERENT COMPONENTS, never one with a mode.

  ONE OF THEIRS IS CONTRADICTED: Astryx says "don't nest cards". The real rule is not about cards,
  it is about TARGETS. A static `Card` inside anything is fine and is what a design-system specimen
  sheet is made of; an `InteractiveCard` inside another target is the double-fire measured on Menu —
  one press, two handlers. So: nest static cards freely, never nest two targets.

  IT IS A SURFACE AND NOT AN ANATOMY. It owns the box, the corner, the padding and the fill; what
  goes inside is the caller's. Astryx's own anatomy is exactly two rows — container and content.
*/
import type { CSSProperties, ReactNode } from 'react'
import { LevelContext, useLevel } from './LevelContext'
import { Children, forwardRef, isValidElement } from 'react'

/*
  THE CORNER LADDER IS `Popover`'s, NOT A SECOND ONE. That component settled 8 / 12 / 16 for
  floating surfaces with an argument that applies here unchanged: the corner belongs to the size of
  the SURFACE, not to whatever opened it. A card is a surface, so it reads the same rungs — and a
  popover and a card of the same size now agree, which they did not before Popover existed.

  THE PADDING MOVES WITH IT, which is the other half of what a size means here. A large corner on
  tight padding reads as a mistake: the radius wants room to turn in.
*/
export type CardSize = 'small' | 'medium' | 'large'

/*
  WHICH RUNG FILLS THE CARD — the card's one fill control, now that the edge (shadow / outline)
  is gone: a card is a flat, borderless surface, and `level` is the only thing that moves its fill.

  IT WAS `surface="dominant" | "neutral" | "subtle"` AND THE WORDS WERE THE PROBLEM. They were
  the tokens' own names once, and the tokens moved to numbers because the number is an
  IDENTITY rather than a rank — see docs/knowledge-levels.md. Left alone, the prop asked for
  a word and the stylesheet answered with a rung, and the mapping was memorable to nobody:
  `subtle` was rung ONE, not rung two, and nothing about the word said so.

  FOUR NOW, NOT THREE. The old vocabulary had no word for the ground, so a card could not be
  asked to sit flush with its page — the ghost state the model allows was simply unreachable.
  `level={2}` on a default page is that state, and it is a design decision rather than a gap.
*/
export type CardLevel = 1 | 2 | 3 | 4

/*
  THE RUNG A CARD PUTS ITS CONTENTS ON — the answer to "large card, large parts", written once so
  it is a rule rather than a habit each caller repeats differently.

  IT IS AN IDENTITY MAP, AND THAT IS THE POINT. `small` card → `small` parts, all the way down.
  A card forwards its rung by NAME (`ButtonSize`, worn by Button, Chip, Tag, Avatar and now the
  marks), and `ProgressBar`/`Meter` share their own three rungs, so a card never has to translate
  between scales — it only has to say WHICH rung, and every part already understands the word. It
  maps the WORD, not the pixels: Chip and Tag are on the row ladder (24 / 32 / 56) while Button
  stands a rung higher (32 / 50 / 56). A table that mapped `medium` card to `small` parts would be inventing a second scale.

  TYPE IS THE ONE AXIS THAT IS NOT THE SAME WORD, because the type ladder is named by role rather
  than by size. The three levels here are the ones `Checkbox` already steps through for its own
  caption — microcopy, body-s, body-l — so a card's title and a control's label at the same rung
  are the same size, which is the whole reason this table is exported rather than described.

  IT IS NOT ENFORCED, AND DELIBERATELY. A card cannot reach into arbitrary `children` and resize
  them, and a React context that silently rewrote a Button's size would make an explicit
  `size="small"` on that Button a lie. The rule is a value the caller spreads; the story shows the
  three rungs side by side so a mismatch is visible rather than argued about.
*/
export const CARD_PART_SIZE = {
  small: { part: 'small', bar: 'small', type: 'microcopy' },
  medium: { part: 'medium', bar: 'medium', type: 'body-s' },
  large: { part: 'large', bar: 'large', type: 'body-l' },
} as const satisfies Record<CardSize, { part: CardSize; bar: CardSize; type: string }>

/*
  THE STATIC CARD CARRIES NO NAME AND NO HANDLER, because it is not a thing to be announced or
  pressed — it is a box round some content that already announces itself. A card whose whole box is
  a target is a different component (`InteractiveCard`), and one that is a choice is a third
  (`SelectableCard`). Keeping them apart is what lets each say exactly what it is.
*/
export type CardProps = {
  size?: CardSize
  children: ReactNode
  /** which container rung fills it — see `CardLevel` */
  level?: CardLevel
  /*
    GLASS OR OPAQUE — and it is a MATERIAL choice rather than an opacity slider, because all three
    container tokens are `rgba(…, 0.5)`. There is no opaque container in this foundation.

    `blur` keeps the token translucent and frosts what is behind the card: real glass. Without it
    the token is composited over `--background` and the card is an opaque fill of the same hue —
    the honest alternative, because a translucent token painted with NO frost is a wash, which
    looks like a fill only until something moves behind it. The kit's `glass-material-test` says
    so, and it caught four of these in the kit before this prop existed.

    IT IS OFF BY DEFAULT. Frosting is a compositing cost paid per element, and a list of cards is
    the case where that bill arrives; the card that wants to sit over a photograph or a moving
    canvas asks for it.
  */
  /*
    WHICH POLE THE CARD STANDS ON — the ground (`tonal`, the default) or the scheme's accent
    (`strong`). It writes `data-tense`, and the foundation then resolves `--background` to the
    accent and `--text` to the ink authored to sit on it, for the card AND everything inside it.

    IT HAS TO BE A PROP, and that is a consequence of the card being a level island rather than
    an oversight. `data-tense` on an ancestor does not reach a card that names its own `level`:
    the card writes `data-level` on itself, and the level island re-declares `--background`
    there, which is exactly the escape hatch that lets a strong Button sit inside a normal card
    without the card going dark. The same rule read the other way means a card can only be told
    to stand on the accent by being told directly. Measured: the pole on an ancestor moves the
    card's `--background` not at all; on the card itself it moves it from the rung to the accent.
  */
  tense?: 'tonal' | 'strong'
  blur?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  THE TWO SLOTS INSIDE A CARD, and why they are components rather than props.

  A card holds two kinds of content at once — INLINE (text, marks, meters,
  progress bars) that lives inside the card's per-size padding, and CANVAS
  (image, chart, photograph) that sits flush with the card's rounded
  rectangle on the edge it is anchored to. The dividing question is which
  side of the padding a child sits on, and that is answered by which
  component the child is.

  `<CardBody>` is the padded slot. `<CardCanvas edge="top|bottom|start|end">`
  is the unpadded one, positioned via CSS `order` off the `edge` class it
  writes; a canvas at inline-start or -end also flips the parent Card into a
  row via `:has()`. No `layout` prop, no `direction` prop — placing a
  CardCanvas IS how a row is asked for. This is the modes-derived-never-
  declared rule from COMPOSITION-RULES applied one level down.

  BACKWARD-COMPAT, on purpose. `<Card>plain children</Card>` still works:
  children that are not CardBody / CardCanvas get auto-wrapped in one
  CardBody, so no existing call site changes. Explicit CardBody is the
  clear form and is what stories and the docs use going forward.

  ONE CANVAS PER CARD, deliberately. Two canvases at different edges is a
  layout question a card does not answer today — it becomes a page, and a
  page is what CardCanvas + siblings compose into.
*/
export type CardCanvasEdge = 'top' | 'bottom' | 'start' | 'end'

export const CardCanvas = ({ edge = 'top', children, style }: { edge?: CardCanvasEdge; children: ReactNode; style?: CSSProperties }) => (
  <div className={`nd-card-canvas u-canvas-${edge}`} data-edge={edge} style={style}>
    {children}
  </div>
)
CardCanvas.displayName = 'CardCanvas'

/*
  PADDED ONCE, NEVER TWICE. CardBody applies the card's `--nd-card-pad` to its content.
  A child placed here must be FLUSH — no outer padding of its own — or the two insets
  stack and its content sits deeper than the same content in the card beside it.

  Ledger's measured drift: a Stat block carried its own `padding: 12px`; placed in a
  card whose body padded at 16px, its content landed at 30px inline-start while the
  chart card beside it sat at 16 and the list card beside that at 8. Three cards,
  three insets, no shared alignment. Stripping the child's outer padding lined the
  three back up.

  IF A CHILD NEEDS INTERNAL SPACING, that is `gap` between its parts, not `padding`
  around itself. The card owns the outer inset; the child arranges its own inside.

  IF A CHILD NEEDS TO REACH THE CARD'S EDGES — an image, a chart, an edge-to-edge
  photograph — that is `<CardCanvas>`. Not this. There is no third mode: content is
  either padded (here) or canvas (there); "content that wants to be flush with the
  edges" is asking for a canvas without saying so, and the rule refuses it.
*/
export const CardBody = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div className="nd-card-body" style={style}>
    {children}
  </div>
)
CardBody.displayName = 'CardBody'

/*
  THE CARD'S CAPTION IS A SLOT, NOT A CONVENTION. The ledger's `Panel` (50 sites) built a
  `header.panel-head` above every card body — icon, `h2` title, sub, tags, aside, actions —
  and the census found the actions at two rungs (the part rung on one page, a hardcoded
  `small` on six) and wrapped two ways, so alignment depended on the caller. `CardHeader`
  is that head as a Card slot beside `CardBody` and `CardCanvas`: it sits first, pays the
  card's inset on three sides (the body pays the fourth), and its title is the card's
  CAPTION — `h3` at `body-s` semibold, SECTION-RULES a1 — never the region's heading.
  Actions trail in a Cluster at the end edge; their rung is the caller's
  (`CARD_PART_SIZE[size].part`), because a slot never sizes its host and a header never
  sizes its buttons.
*/
export type CardHeaderProps = {
  /** the caption — a string, because it names the card */
  title: string
  /** a glyph before the title — an Icon; it inherits the mark colour and the caption's size */
  icon?: ReactNode
  /** a line under the title, `microcopy`, recessive */
  sub?: ReactNode
  /** Tags after the title */
  tags?: ReactNode
  /** the header's actions — `ghost` or `tonal` at the card's part rung, never `primary`; they trail at the end edge */
  actions?: ReactNode
  style?: CSSProperties
}

export const CardHeader = ({ title, icon, sub, tags, actions, style }: CardHeaderProps) => (
  <div className="nd-card-head" style={style}>
    {icon != null && icon !== false && (
      <span className="nd-card-head-icon" aria-hidden>
        {icon}
      </span>
    )}
    <div className="nd-card-head-titles">
      <h3 className="nd-card-head-title">{title}</h3>
      {sub != null && sub !== false && <div className="nd-card-head-sub">{sub}</div>}
    </div>
    {tags != null && tags !== false && <span className="nd-card-head-tags">{tags}</span>}
    {actions != null && actions !== false && <span className="nd-card-head-actions">{actions}</span>}
  </div>
)
CardHeader.displayName = 'CardHeader'

const isCardHeader = (node: unknown): boolean =>
  isValidElement(node) && (node.type as { displayName?: string })?.displayName === 'CardHeader'
const isCardCanvas = (node: unknown): boolean =>
  isValidElement(node) && (node.type as { displayName?: string })?.displayName === 'CardCanvas'
const isCardBody = (node: unknown): boolean =>
  isValidElement(node) && (node.type as { displayName?: string })?.displayName === 'CardBody'

/*
  RESOLVE THE CHILDREN, ONCE, HERE. Any explicit CardBody / CardCanvas passes
  through; anything else is collected into a single auto-CardBody, so the
  common "just some inline content" case writes as it always has. Both Card
  and InteractiveCard call this — the hit-layer sits alongside the same
  resolved children in InteractiveCard, so both shapes route content the
  same way.
*/
export const resolveCardChildren = (children: ReactNode): ReactNode => {
  const kids = Children.toArray(children)
  const hasExplicitBody = kids.some(isCardBody)
  if (hasExplicitBody) return kids
  const heads = kids.filter(isCardHeader)
  const canvases = kids.filter(isCardCanvas)
  const others = kids.filter((k) => !isCardCanvas(k) && !isCardHeader(k))
  return others.length > 0 ? [...heads, ...canvases, <CardBody key="__body">{others}</CardBody>] : [...heads, ...canvases]
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { size = 'medium', level, blur = false, tense, children, style },
  ref
) {
  const inherited = useLevel()
  const className = ['nd-card', `s-${size}`, level ? `u-${level}` : '', blur ? 'is-glass' : '']
    .filter(Boolean)
    .join(' ')

  /*
    A CARD WITH AN EXPLICIT `level` IS A LEVEL ISLAND. It writes `data-level={N}` on the
    same element that carries the `.u-N` class, so descendants (fields inside the card,
    a nested card, a status region) see the level context via `[data-level]` — the same
    mechanism the Storybook toolbar's Page control uses. The `.u-N` class alone paints
    the card's own fill but does not shift the context, which is what fields need in
    order to lift one rung off the ground they stand on (COLOR-TOKEN-RULES's "field-fill
    is one level up"). No `data-level` when `level` is absent, so a plain `<Card>` still
    sits on whatever island already surrounds it, unchanged.
  */
  /*
    …AND IT PUBLISHES THAT LEVEL TO REACT AS WELL AS TO CSS. `data-level` moves the CSS
    context; `LevelContext` moves the one a field needs in JavaScript, because the rung a
    field paints is one ABOVE its ground and CSS can no longer name that (see
    LevelContext.tsx). A card with no explicit `level` republishes the ground it inherited,
    so a field two cards deep still steps from the level it is actually standing on.
  */
  const ground = level ?? inherited

  return (
    <LevelContext.Provider value={ground}>
      <div ref={ref} className={className} data-level={level}
        data-tense={tense === 'strong' ? 'strong' : undefined} style={style}>
        {resolveCardChildren(children)}
      </div>
    </LevelContext.Provider>
  )
})
