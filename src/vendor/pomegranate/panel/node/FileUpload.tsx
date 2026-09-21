/*
  FileUpload — the surface that takes files, and nothing else.

  RESEARCHED against documented knowledge of Spectrum's DropZone + FileTrigger split,
  Carbon's FileUploader, Polaris's DropZone and the W3C's own guidance on
  `<input type="file">`. The Design System Assistant needs the Figma Desktop Bridge and was
  not reachable in this session, so nothing here is attributed to it; Astryx has no upload
  component to read. The peers agree on two things and disagree on a third, and the
  disagreement is the interesting one: everyone builds the zone on a real file input,
  everyone treats drag-and-drop as an enhancement over it, and they split on whether the
  component uploads. This one does not — see THE SCOPE, below.

  THE SCOPE, STATED FIRST BECAUSE EVERY OTHER DECISION FOLLOWS FROM IT. This component
  reports files and renders nothing about their fate. No `fetch`, no `XMLHttpRequest`, no
  retry, no abort, no queue. A design-system component that owns transport is a networking
  library wearing a props table: its states are unreachable from a story, untestable by
  every suite in this repo, and wrong for the first caller whose backend wants a presigned
  PUT instead of a multipart POST. What the kit owns is the SURFACE — the target, the
  validation the target can honestly perform, and the states a person can see.
  `FileUploadList` + `FileUploadItem` draw what the caller learns afterwards.

  IT IS A CARD, AND THAT IS A RULE RATHER THAN A RESEMBLANCE. LAYOUT-RULES: "every visible
  surface on it is the card system's… a hand-rolled box — bespoke `border` + `border-radius`
  + `background` — is a fourth card nobody reviewed. If the kit's cards cannot express it,
  that is a component request, not a licence." The first draft of this file WAS that fourth
  card: it drew its own radius, its own padding, its own fill, its own hover and its own
  ring, all of them values `.nd-card` already publishes. It renders the card's own surface
  now — `.nd-card` + `s-{size}` + `u-{level}` + `is-target` — exactly as `InteractiveCard`
  does, which is the pattern for "a card whose whole box is a target" and which this is a
  fourth member of. Size, level, corner, padding, glass, the pointer routing that lets an
  inner control take its events back, and the CardBody slot all arrive with the class.

  WHAT THE ZONE STILL OWNS IS THE PAINT, because it is a CONTROL and a card is a container.
  The card family fills from the container ladder; every control in this kit lifts one rung
  onto `--nd-field-fill` so it cannot merge with its own ground (see node.css, and §46,
  which this component is now a row of). So three declarations override the card's: the
  fill and its two state stops. Everything else the card says stands.

  THE TARGET IS THE HIT LAYER, THE KIT'S OWN. The canonical dropzone — a large pressable
  panel with a "Browse" button inside it — is the shape COMPOSITION-RULES bans outright: a
  target inside a target, one press firing two handlers, a tab stop inside a tab stop. So
  the target is EMPTY and stretched (`.nd-card-hit`, the same class InteractiveCard's
  `<button>` and `<a>` wear) and the content is its SIBLING. It is a `<label>` rather than a
  button, which is the whole trick: a label activates the input it names from anywhere in
  the document, so the platform's own picker opens on click, Enter and Space with nothing
  written, and the file input keeps the tab stop and the role.

  THE NAME IS THE TITLE, EXPLICITLY. The hit layer is empty, so it carries no name of its
  own; the input takes `aria-labelledby` the title and `aria-describedby` the hint, which is
  both what those two strings ARE and what keeps WCAG 2.5.3 satisfied — the name is exactly
  the visible title, not a longer string that happens to contain it. (This is also why the
  label is not wrapped around the content: a label's whole text content becomes the name, and
  this zone would have announced "Drop files here or choose them, PNG or SVG, up to 2 MB".)

  DRAG-AND-DROP IS AN ENHANCEMENT, NEVER THE COMPONENT. It is pointer-only: there is no
  keyboard path to a drag and none on touch. So the input is the component and the drop is
  layered over it — which is also why `accept` is enforced twice below. The attribute filters
  the PICKER; it does nothing whatever to a drop. A zone that says "SVG only" and silently
  accepts a dropped .exe is lying in the one direction that matters, so the same predicate
  runs over dropped files in JS.

  THE DRAG STATE STEPS THE LADDER IT ALREADY HAD. INTERACTION-RULES gives three words for
  "chosen" and none of them means "a drag is currently over me" — `is-on` is a compact
  control's lit face, `is-selected` a surface chosen among peers, `is-active` an open
  flyout's trigger. This is a fourth thing and takes a fourth word, `is-dropping`, but NOT a
  fourth mechanism: it resolves to the same hover→pressed token step every other surface in
  the kit uses, because a drag hovering is a hover that happens to be carrying something.

  A LIMIT ARRIVES WITH ITS REPORT, in the type. The same shape TextField's `maxLength`
  argues for and for the same reason: a rule that silently discards half a drop is a trap,
  and "why did only two of my five files appear" is unanswerable from the screen. So
  `accept` and `maxSize` are unwritable without `onReject` — and the caller's rejection text
  is what satisfies WCAG 3.3.1, which a red border never does.
*/
import type { CSSProperties, DragEvent, ChangeEvent, PointerEvent, ReactNode } from 'react'
import { LevelContext, fieldLevel, useLevel } from './LevelContext'
import { useId, useRef, useState } from 'react'
import { CardBody, type CardLevel, type CardSize } from './Card'
import { UploadIcon } from './Icon'

/*
  TWO SHAPES OF THE SAME ZONE, and the axis is the CONTENT's, not the box's.

  `vertical` stacks the visual over the words and centres them — the big empty target, for a
  page or a panel whose main job is "put something here". `horizontal` sets the visual beside
  them and starts them at the inline edge — a row, for a form that has six other fields and
  cannot spend 130px of height on one of them.

  IT IS A PROP RATHER THAN A SECOND COMPONENT because nothing else about it differs: the same
  input, the same target, the same validation, the same states, the same accessible name. The
  kit's split test asks whether a variant has a DEAD HALF — a prop that paints nothing or
  announces nothing in one of its values — and this one has none. `ProgressBar`, `Meter`,
  `Slider`, `Stepper` and `Divider` all carry the same axis for the same reason, each with its
  own union (the kit retypes orientation per component and aliases only the SIZE ladders), and
  the class is `o-{orientation}` as it is on all five.
*/
export type FileUploadOrientation = 'vertical' | 'horizontal'

/** why a file did not get through. Two rules, two reasons — the component performs no third */
export type FileRejectionReason = 'type' | 'size'

export type FileRejection = {
  file: File
  reason: FileRejectionReason
}

type FileUploadBase = {
  /*
    THE VISIBLE TITLE, AND THE ACCESSIBLE NAME — one string, because they must agree
    (WCAG 2.5.3) and two props that must agree are one prop. There is no `labelHidden`
    here: a drop zone with no visible words is a rectangle, and ProgressBar's hidden-label
    construction exists for a bar that sits beside a heading, which this never does.
  */
  label: string
  /*
    THE FILES THE ZONE ACCEPTED, in the order the platform handed them over. Always an
    array, even at `multiple={false}` — a caller that reads `[0]` is written the same way
    whichever it is, where a `File | File[]` union makes every call site branch.
  */
  onFiles: (files: File[]) => void
  /*
    THE SECOND, QUIETER LINE — the format and the ceiling, in words. It is `aria-describedby`
    rather than part of the name (see the header) and it is a node rather than a string so a
    caller can put a Tag or a count in it.
  */
  hint?: ReactNode
  /*
    THE VISUAL AT THE HEAD OF THE ZONE — the upload arrow unless the caller has something
    better to say. What "better" means is the point of the slot: a thumbnail of the image
    being replaced, an Avatar for the person whose photo this is, a `Spinner` while the last
    one is still going, a kind glyph for a zone that only takes spreadsheets. It answers
    "what am I putting here" with a picture instead of asking the words to do it.

    ITS BOX IS AVATAR'S LADDER — 22 / 32 / 40, the three sizes `.nd-avatar.s-*` declares — so
    an `<Avatar size="small">` in a `small` zone fills the slot exactly rather than sitting
    letterboxed inside it, and the same holds at the other two rungs.

    IT IS A SLOT AND SO IT IS DECORATIVE, BY FIAT. `.nd-upload-glyph` carries `aria-hidden`,
    which is TextField's rule for its leading slot stated once more: a mark at the head of a
    control is decoration by definition, and the alternative — asking every caller to mark
    its own artwork — is exactly the per-site decision this kit exists to remove. The kit's
    own icons are `aria-hidden` already; an `<img>` a caller passes is not, and this is what
    covers it.

    IT IS `leading`, NOT `icon`. Six components against two settled that vocabulary (§25),
    and the logical name is also the correct one — `left` is a promise that breaks the moment
    the document is right-to-left, and this slot moves with the orientation.
  */
  leading?: ReactNode
  /** stacked and centred, or beside the words and inline-start. See `FileUploadOrientation` */
  orientation?: FileUploadOrientation
  /** one file or many. The set's fact, and the native attribute — nothing is derived here */
  multiple?: boolean
  /*
    THE CARD'S OWN TWO AXES, ALIASED RATHER THAN RETYPED (§25). A zone is a card, so its
    corner, its padding and its rung are the card system's decisions and are spelled with
    the card system's types — a component that restated `'small' | 'medium' | 'large'` here
    would be a second ladder that looks like the first until the day one of them moves.
  */
  size?: CardSize
  /** which container rung fills the box — see `CardLevel`. Absent follows the subtree */
  level?: CardLevel
  disabled?: boolean
  /** placement only — margin and grid position belong to the layout that holds the zone */
  style?: CSSProperties
}

/*
  A RULE IS UNWRITABLE WITHOUT SOMEWHERE FOR ITS REFUSALS TO GO.

  Three shapes, and the third is what makes the first two mean something: declare `accept`,
  or declare `maxSize`, or declare neither — but a zone that filters and cannot say so is
  not expressible. `?: never` on the third arm is what closes it; without it, TypeScript
  admits `{}` against the first two by structural excess-property rules and the whole
  constraint evaporates.
*/
type FileUploadFilter =
  | { accept: string; maxSize?: number; onReject: (rejected: FileRejection[]) => void }
  | { maxSize: number; accept?: string; onReject: (rejected: FileRejection[]) => void }
  | { accept?: never; maxSize?: never; onReject?: never }

/*
  AN ERROR MUST BE SAYABLE — the union TextField and DropDownSelect both carry, ported for
  the third time and for the identical reason. `invalid` reports THAT something is wrong;
  WCAG 3.3.1 asks for the reason in TEXT, and `describedBy` is the id of the element
  carrying it. The stroke turning red is a second signal, never the only one.
*/
type FileUploadValidity = { invalid: true; describedBy: string } | { invalid?: false; describedBy?: string }

export type FileUploadProps = FileUploadBase & FileUploadFilter & FileUploadValidity

/*
  THE `accept` PREDICATE, WRITTEN OUT BECAUSE THE PLATFORM ONLY APPLIES IT TO THE PICKER.

  Three forms, exactly the three the attribute defines: an extension (`.svg`), a full type
  (`image/svg+xml`) and a wildcard (`image/*`). Comparison is case-insensitive on both
  sides — a file named `MARK.SVG` is an SVG, and a browser that reports `Image/PNG` (some
  do, from the drag data store) must not be a rejection.

  An empty `accept` accepts everything, which is the attribute's own behaviour and not a
  special case invented here.
*/
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  return accept
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule)
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
      return type === rule
    })
}

export function FileUpload({
  label,
  onFiles,
  hint,
  accept,
  maxSize,
  onReject,
  leading,
  orientation = 'vertical',
  multiple = false,
  size = 'medium',
  level,
  disabled = false,
  invalid = false,
  describedBy,
  style,
}: FileUploadProps) {
  const id = useId()
  const inputId = `${id}-input`
  const titleId = `${id}-title`
  const hintId = `${id}-hint`

  /*
    DRAG ENTER AND LEAVE FIRE PER DESCENDANT, not per zone: moving the pointer from the
    glyph onto the title raises `dragleave` on one child and `dragenter` on the next, and a
    boolean flipped by both flickers the state on every internal boundary. The depth counter
    is the standard cure — the zone is under a drag while more enters than leaves have
    arrived. It is a ref rather than state because nothing renders from it; only its
    zero-crossing does.
  */
  const depth = useRef(0)
  const [dropping, setDropping] = useState(false)

  /*
    THE ONE PLACE BOTH ROUTES MEET. The picker and the drop hand over the same shape and are
    held to the same two rules, so partition happens once — a second copy is how a zone ends
    up enforcing its size limit on typed files and not on dropped ones.

    `multiple={false}` TAKES THE FIRST AND SAYS NOTHING ABOUT THE REST. The native input
    cannot hand over a second file, so this only ever bites on a drop; discarding the extras
    as rejections would report a "failure" the person did not commit, and the browser's own
    behaviour is silence.
  */
  const take = (list: FileList | null) => {
    if (disabled || !list) return
    const incoming = multiple ? [...list] : [...list].slice(0, 1)
    const accepted: File[] = []
    const rejected: FileRejection[] = []
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) rejected.push({ file, reason: 'type' })
      else if (maxSize != null && file.size > maxSize) rejected.push({ file, reason: 'size' })
      else accepted.push(file)
    }
    /*
      BOTH HALVES ARE REPORTED, THE EMPTY HALF IS NOT, AND THE ORDER IS THE ACCEPTANCES
      FIRST — which was the other way round until it was driven with a real drop.

      One gesture can raise both callbacks, so the caller has to be able to clear last
      drop's refusals somewhere. The obvious place is `onFiles` ("a new drop arrived, wipe
      the banner"), and the story written that way silently ate every refusal: `onReject`
      had already run, and the acceptance handler cleared what it had just set. Reversing it
      makes the natural code correct — the report lands last and survives whatever the
      acceptance handler did — and there is no arrangement in which the reverse is true.
    */
    if (accepted.length) onFiles(accepted)
    if (rejected.length && onReject) onReject(rejected)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    take(e.target.files)
    /*
      THE INPUT IS EMPTIED AFTER EVERY PICK. Without this, choosing the same file twice in a
      row raises no `change` at all — the value did not change — so a person who removed a
      file by mistake cannot re-add it without picking something else first. The input holds
      no state worth keeping: the accepted files have already left.
    */
    e.target.value = ''
  }

  /*
    `preventDefault` ON DRAGOVER IS WHAT MAKES A DROP POSSIBLE. Without it the browser's
    default action wins and the file opens in the tab, replacing the whole application —
    the single most destructive failure this component can have, and it is one missing line
    away at all times.
  */
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
  }

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    depth.current += 1
    setDropping(true)
  }

  const onDragLeave = () => {
    if (disabled) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDropping(false)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    depth.current = 0
    setDropping(false)
    take(e.dataTransfer.files)
  }

  /*
    A POINTER PRESS STOPS HERE, and a key press does not — the kit's standing split, argued
    at length in TextField's header. A press inside a control must never start a host drag;
    a swallowed keystroke eats the host's own ⌘K.
  */
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => e.stopPropagation()

  const className = [
    /*
      THE CARD'S CLASSES ARE THE SURFACE, in the order InteractiveCard writes them. `is-target`
      is what routes the pointer: the body goes `pointer-events: none` so a press lands on the
      hit layer, and anything genuinely operable inside takes its events back — machinery this
      component would otherwise have had to invent, and which is why a "fourth card" is never
      only a fourth set of colours.
    */
    'nd-card',
    `s-${size}`,
    level ? `u-${level}` : '',
    'is-target',
    /*
      AND `nd-upload` IS THE PAINT ON TOP OF IT — the field ladder, because this is a control.
      It also carries the material: `--nd-field-fill` is a half-alpha container stop in glass
      mode, and a translucent fill with no frost is the wash the doctrine forbids. `.nd-glass`
      is redundant here (the four `.nd-upload` surfaces are named in node.css's frost list,
      which is what glass-material-test reads) except for one thing only the class does — the
      `prefers-reduced-transparency` retreat — so both stay, as they do on the fields.
    */
    'nd-upload',
    `o-${orientation}`,
    'nd-glass',
    dropping && !disabled ? 'is-dropping' : '',
    invalid ? 'is-invalid' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /* the hint is described, the caller's error message is described, and both survive
     together — an invalid zone still has to say what it accepts */
  const inheritedLevel = useLevel()
  const described = [hint != null ? hintId : '', describedBy ?? ''].filter(Boolean).join(' ')

  return (
    /* the same level-island behaviour as Card and InteractiveCard — see Card.tsx on
       data-level, and LevelContext.tsx on why it also travels in React */
    <LevelContext.Provider value={level ?? inheritedLevel}>
    <div
      className={className}
      data-level={level}
      /*
        ONE RUNG OFF ITS GROUND — and the ground is the level THIS card declares, which is why
        the argument is the resolved `level ?? inheritedLevel` rather than `useLevel()`: this
        element is the provider's own child in the DOM but sits outside it in React, so a
        `useLevel()` here would read the level the card is standing ON, not the one it IS.
        Without the attribute `--nd-field-fill` is undeclared and `background:
        var(--nd-field-fill)` paints nothing at all.
      */
      data-fill={fieldLevel(level ?? inheritedLevel)}
      style={style}
      onPointerDown={onPointerDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/*
        THE HIT LAYER — empty, stretched, and a `<label>` rather than a button. A label
        activates the input it names from anywhere in the document, so the platform's own
        picker opens on click, on Enter and on Space with nothing written here, and the tab
        stop and the role stay on the input where they belong. It carries no name: the input
        points at the visible title instead (see the header).
      */}
      <label className="nd-card-hit" htmlFor={inputId} />
      {/* THE INPUT IS THE COMPONENT. It is taken out of sight rather than out of the tree:
          `display: none` and `visibility: hidden` remove a control from the accessibility
          tree and from the tab order, which is the whole thing this zone is built on.
          `nd-sr-only` is the kit's own utility for that, spent rather than re-copied. */}
      <input
        id={inputId}
        className="nd-sr-only nd-upload-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={onChange}
        aria-labelledby={titleId}
        aria-describedby={described || undefined}
        aria-invalid={invalid || undefined}
      />
      {/*
        THE CONTENT SITS IN THE CARD'S OWN BODY SLOT, which is where its padding comes from —
        the zone spends no inset of its own. The one thing it adds is block air: a drop target
        is aimed at with a pointer that is already carrying something, a coarser gesture than a
        click, so `.nd-upload > .nd-card-body` is taller than a card's. The inline padding is
        the card's, untouched, which is what puts the zone's text on the same edge as the rows
        beneath it.
      */}
      <CardBody>
        {/* decorative by fiat — see the `leading` prop. The chain ends in a drawing: the
            caller's, or the arrow, never a hole */}
        <span className="nd-upload-glyph" aria-hidden>
          {leading ?? <UploadIcon size="100%" />}
        </span>
        {/*
          THE WORDS ARE ONE BLOCK IN BOTH ORIENTATIONS, which is why the DOM does not fork on
          `orientation` and the CSS does. A structure that changed shape per value would need
          the accessible name re-tied in each one, and two places for a name to be right is
          how one of them ends up wrong.
        */}
        <span className="nd-upload-text">
          <span className="nd-upload-title" id={titleId}>
            {label}
          </span>
          {hint != null && (
            <span className="nd-upload-hint" id={hintId}>
              {hint}
            </span>
          )}
        </span>
      </CardBody>
    </div>
    </LevelContext.Provider>
  )
}
