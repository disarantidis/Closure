/*
  Icon — one drawing from the generated catalogue.

  Every icon on this board is the same component with a different name, and the
  name is a UNION (`IconName`), so a typo is a type error at the call site rather
  than a blank square somebody notices in a screenshot three weeks later. That
  property is the whole reason the catalogue is generated: see scripts/build-icons.mjs.

  Two things it decides about the drawings it wraps:

    · THE COLOUR COMES THROUGH STROKE, because Tabler outline is stroke art —
      `fill="none"`, a 2px line on a 24px grid. Two sets ago (Line Awesome) the
      artwork was the opposite species, fill art with no fill attribute, and this
      component forced `fill="currentColor"`; the lesson generalises rather than
      inverts: an icon inherits the colour of the text beside it through
      whichever channel its artwork is drawn in, and never carries one of its
      own. Dark mode and the nine schemes need no icon work at all. A handful of
      drawings carry a filled dot the stroke cannot express — those arrive
      separately as `solid`, and inherit through fill, which is the same rule.
    · every icon is ALWAYS aria-hidden. An icon on this board never carries
      meaning alone: a row has its label, and an icon-only button gets its
      accessible name from NodeButton's required `label`. Marking it decorative
      here means no icon can accidentally be announced as a second, worse label.
*/
import { ICONS, ICON_STROKE, ICON_VIEWBOX, type IconName } from './icons.generated'

export type { IconName }

/** what the kind table and every call site holds: a drawing, sized and coloured
    by whatever it sits in */
export type IconCmp = (props: { size?: number | string; color?: string; className?: string }) => JSX.Element

export function Icon({
  name,
  size = 14,
  color,
  className,
}: {
  name: IconName
  size?: number | string
  /** leave unset — an icon should inherit the colour of its row */
  color?: string
  className?: string
}): JSX.Element {
  const art = ICONS[name] as { paths: readonly string[]; solid?: readonly string[] }
  return <IconArt paths={art.paths} solid={art.solid} size={size} color={color} className={className} />
}

/**
 * The renderer under Icon — raw paths in, one stroke drawing out.
 *
 * Exported for exactly one caller besides Icon itself: the Storybook inventory
 * page, which draws all 5,130 upstream Tabler icons that are NOT catalogue names
 * and so cannot go through `Icon`. It lives here rather than in that story because
 * this file is the one place allowed to define an svg-bodied component
 * (icon-test's hand-drawn-glyph rule) — the stroke width, the round caps and the
 * aria-hidden stance are the set's identity, and a second copy of them in a
 * story is how two carets learn to disagree.
 */
export function IconArt({
  paths,
  solid,
  size = 14,
  color,
  className,
}: {
  paths: readonly string[]
  /** the few subpaths a drawing fills rather than strokes — a dot, a pupil */
  solid?: readonly string[]
  size?: number | string
  color?: string
  className?: string
}): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX}
      fill="none"
      stroke={color ?? 'currentColor'}
      /*
        THE WIDTH IS A TOKEN, and the generated constant is its fallback.

        `--icons-stroke` resolves through the foundation's `weight` collection —
        the same collection that decides `font-weight` — so an interface set in a
        heavier mode gets heavier icons without a component knowing the two are
        related. It is declared as a STYLE rather than the `strokeWidth`
        attribute because a presentation attribute loses to every stylesheet rule,
        and this value has to win: it is the decision, not the default.

        ICON_STROKE stays as the fallback so a drawing is never strokeless where
        the stylesheet has not loaded — a story in isolation, a test renderer — and
        so the number the artwork was drawn for is still stated in the file the
        artwork comes from.
      */
      style={{ strokeWidth: `var(--icons-stroke, ${ICON_STROKE})` }}
      aria-hidden
      focusable="false"
    >
      {/* a stroke drawing may be several subpath elements; round caps are part
          of the set's design, not a styling choice made here.

          KEYED BY POSITION, and it has to be. These keyed off the path data
          under the previous set, which read as the more honest choice until a
          set arrived whose subpaths routinely open alike — `dice-5`'s five pips
          differ in the third decimal, `cube`'s edges share their command
          prefix — and React started reporting duplicate keys and dropping
          spots off dice. The list is generated, fixed-length and never
          reordered, so the index IS the identity; the two maps are prefixed
          apart because they are siblings under one <svg> and must not collide
          with each other either. */}
      {paths.map((d, i) => (
        <path key={`s${i}`} strokeLinecap="round" strokeLinejoin="round" d={d} />
      ))}
      {solid?.map((d, i) => (
        <path key={`f${i}`} fill={color ?? 'currentColor'} stroke="none" d={d} />
      ))}
    </svg>
  )
}

/**
 * Bind a name once, so the result can be stored in a table and rendered as
 * `<Thing />`. Call at MODULE scope only: calling it in a render would mint a
 * new component type every frame, and React would remount the icon each time.
 */
export function icon(name: IconName): IconCmp {
  const Bound = (props: { size?: number | string; color?: string; className?: string }) => <Icon name={name} {...props} />
  Bound.displayName = `Icon(${name})`
  return Bound
}

/* The glyphs used outside the kind table — board chrome, kit rows, stories.
   Named here rather than at each call site so the same idea is the same drawing
   everywhere: "delete" is one glyph on this board, not four similar ones. */
export const ClockIcon = icon('clock')
export const CalendarIcon = icon('calendar')
export const TimerIcon = icon('timer')
export const FilterIcon = icon('filter')
export const PlayIcon = icon('play')
export const GearIcon = icon('mechanism')
export const EditIcon = icon('edit')
export const DeleteIcon = icon('delete')
export const MenuIcon = icon('menu')
export const CaretIcon = icon('caret')
export const LinkIcon = icon('link')
/* the foundation's icons.semantic.dismiss — the × on a tag. Bound here like every
   other glyph so "dismiss" is ONE drawing across the kit rather than a per-component
   choice, which is the whole reason this list exists. */
/* the foundation's `icons.semantic.confirm`. Checkbox is the first thing in the kit with a
   checked state to draw, which is why a drawing the inventory has always held is only now
   in the catalogue. */
export const ConfirmIcon = icon('confirm')
export const DismissIcon = icon('dismiss')
export const TilesIcon = icon('coreRamp')
/* the four currency marks — €, $, £, ¥ — for the leading slot of a field where the
   value carries an amount. Named for the SYMBOL rather than the country ("euro" not
   "eur"), matching the mark a reader points at rather than the ISO code a caller may
   or may not spell right. Other currencies are one line each in build-icons.mjs when
   a call site earns them; the inventory holds all thirty. */
/* THE UPLOAD PAIR. `upload` is the arrow the drop zone draws — the one glyph in the kit that
   names an ACTION a surface invites rather than a thing it holds. `file` is the fallback for a
   row whose file the caller could not type: the kind table already answers `image` and `text`
   (a picture, a note), and everything else — an archive, a font, a CSV — has no kind here and
   would otherwise fall to `fallback`, whose grid means "unknown NODE", not "unknown file". */
export const UploadIcon = icon('upload')
export const FileIcon = icon('file')
/* THE TWO FILE KINDS THE CATALOGUE ALREADY DRAWS, bound here for the rows that are not node
   cards. `image` and `text` are node KINDS and `nodeIcons.tsx` binds them for the canvas; a
   file row means the same two things and must not mean them with a different drawing, so both
   names resolve through the same catalogue entry. Bound rather than reached for as
   `<Icon name="image">` at the call site, which was the kit's only inline use of the raw
   component: every other glyph in the kit arrives as a named component, and that list is what
   makes "the same idea is the same drawing" checkable by reading imports. */
export const ImageIcon = icon('image')
export const TextIcon = icon('text')
export const EuroIcon = icon('euro')
export const DollarIcon = icon('dollar')
export const PoundIcon = icon('pound')
export const YenIcon = icon('yen')
