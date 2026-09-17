/*
  Button — the board's action, in one component.

  Three variants, and they are three MATERIALS rather than three colours:

    primary   the accent, opaque            — the one action a view is about
    tonal     the glass container           — an action among others, and the default
    ghost     no fill, no stroke            — an action that lives inside something else

  `tonal` is the only one carrying the glass material, and it carries it all the way
  through hover, pressed and disabled — the surface never changes what it is MADE of,
  only which rung of the ramp it sits on. That is the whole reason the foundation's
  container roles moved onto `glass-neutral`, in every scheme, before this component
  was written.

  DESTRUCTIVE IS NOT A VARIANT. It used to be (`danger`) — a fifth colour bolted onto
  an axis that is about material. It is a SCHEME now: put the button inside
  `data-scheme="error"` and every role it reads repaints, accent becomes the error red,
  text-on-accent stays legible against it (8.86:1, measured), and the glass container
  comes with it. Which means a destructive CONTAINER and a destructive GHOST exist for
  free, where a `danger` variant could only ever have been one shape. The scheme axis
  already did this for the whole system; the button stopped pretending it needed its own.

  SLOTS, NOT AN ICON PROP. `leading` and `trailing` take any node — an icon, a badge, a count,
  something nobody has thought of. The previous `icon` prop took a component and sized
  it, which is exactly why it could only ever be an icon. The component still decides
  the size (node.css sizes whatever svg lands in a slot), so callers gain freedom
  without gaining the ability to get it wrong.

  `square` exists because a slot-only button that is not square is a rectangle with a
  lonely icon in it — the node menu and the panel close are both this. A slot-only
  button REQUIRES a label prop, and the type makes it required, so the unannounceable
  control is not a mistake you can make here.

  It is presentational and unwired: no board state, no navigation, nothing but what it
  looks like and what it announces.
*/
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { fieldLevel, useLevel } from './LevelContext'
import { forwardRef } from 'react'
import type { TextFieldSize } from './TextField'
import { Spinner } from './Spinner'
import { glassLightRef } from './glassLight'

export type ButtonVariant = 'primary' | 'tonal' | 'ghost'
export type ButtonSize = 'small' | 'medium' | 'large'
/*
  KIND — button vs icon-button. Replaces the old `shape` axis (rect | pill | square) whose values
  did not name what they were: `square` was only ever an icon-button, `rect` the default with
  rounded corners, and `pill` a decoration nobody chose to keep. This makes the shape a
  CONSEQUENCE of what the button IS: an icon-button is square at its own height, a button
  isn't. One decision, in one word.
*/
export type ButtonKind = 'button' | 'icon-button'
/*
  THE FIELD RUNGS ARE A SECOND AXIS, AND THE TYPE IS THE FIELD'S OWN.

  `fieldRung` takes `TextFieldSize`, not a fresh `'small' | 'large'`, and the import is the
  point rather than a tidiness: this prop exists because matching a field's BOX with `size` is
  not matching its BASELINE, so a caller reaching for a field-height button should be reading the
  FIELD's type when they pick the rung. Alias it locally and the day the field ladder grows a
  rung, this one silently would not.

  It is a UNION WITH `size` below rather than a third value on it. `size` is Button's own ladder
  — 32/50/56, one rung above the row ladder Tag and Checkbox stand on — and `fieldRung` is the
  field ladder, 50/56, spending the field's own lift and drop so the label lands on the value
  row. `size`'s top two rungs already match a field's boxes (50 and 56); passing both is still a
  contradiction (which padding pair wins), so the type makes it a compile error instead of a
  precedence rule nobody can remember the direction of.
*/
export type ButtonFieldRung = TextFieldSize

/* `type` is Omitted from the spread's attribute source and re-admitted as an explicit
   prop below: with it in the rest-spread, any caller could silently flip the button to
   React's in-form default of `submit` — the famous footgun every mature kit pins —
   because {...rest} lands after type="button". The component decides; a caller that
   truly wants submit now has to say so. */
type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'type'> & {
  variant?: ButtonVariant
  kind?: ButtonKind
  /*
    THE SLOTS ARE `leading`/`trailing`, which is the kit's one vocabulary. They were `left` and
    `right` — the original pair — and every component built since (`ListItem`, `Chip`, `Badge`,
    `SegmentedControl`, `TextField`) chose the logical names instead, leaving Button and Tag
    alone on the physical ones. Two words for one slot is the duplicate-vocabulary problem this
    kit keeps deleting, and the logical pair is also the correct one: `left` is a promise that
    breaks in a right-to-left document.
  */
  leading?: ReactNode
  /** anything after it */
  trailing?: ReactNode
  /**
   * whether the button wears the glass material — the frost and the specular rim.
   *
   * THE RULE: **glass belongs to the outermost surface, and nothing inside it.**
   * A standalone button IS a surface, so it frosts and `glass` stays `true` — the
   * default, and the only correct value for a button sitting on a page, in a toolbar,
   * or anywhere it is the thing being pressed.
   *
   * A button NESTED INSIDE another component is not a surface. It is a control on
   * someone else's surface — the caret and the × in a Combobox or a DropDownSelect,
   * the dismiss in a Card or a Tag, any icon button living inside another component's
   * field. That parent already frosts. A nested button that frosts too blurs a
   * backdrop that has itself been blurred, which reads as a smudge rather than a
   * second pane of glass, and costs a second backdrop root to do it. Those pass
   * `glass={false}`.
   *
   * IT APPLIES TO ICON BUTTONS ONLY. A nested button carrying a LABEL is a real
   * action a person chose to put there — "Save", "Add filter" — and it is allowed to
   * read as its own surface. The rule is about the small square icon controls that
   * belong to the field they sit in.
   *
   * Mechanically, `false` repaints hover and press from the solid `--background-*`
   * ladder rather than only dropping the frost: dropping the frost while keeping a
   * translucent fill is a wash, not a plainer button.
   *
   * Defined for `ghost`. `tonal` is glass at rest and the foundation
   * has no solid at-rest container to fall back to, so it ignores this — see the
   * `.no-glass` note in node.css.
   */
  glass?: boolean
  /** stretch to the width of whatever holds it */
  block?: boolean
  /** the pressed state of a toggle — sets aria-pressed, not just a class */
  active?: boolean
  loading?: boolean
  /** the glass rim's angle tracks the cursor by default (see glassLight.ts) — set
      false to pin it back to the foundation's static angle instead. A disabled
      button never tracks regardless of this: an inert control reacting to a
      pointer it cannot respond to is the wrong signal, not a style choice a
      caller should have to remember to turn off. */
  dynamicLight?: boolean
  /** pinned to 'button' — inside a <form>, the platform default is `submit` */
  type?: 'button' | 'submit' | 'reset'
}

/*
  ONE HEIGHT, ONE WAY OF ASKING FOR IT. `size` is Button's ladder and `fieldRung` is the
  field ladder; a call may name either and never both. The default — neither named — is
  `size="medium"`, exactly as it was.
*/
type Rung = { size?: ButtonSize; fieldRung?: never } | { size?: never; fieldRung: ButtonFieldRung }

type WithLabel = Base & Rung & { children: ReactNode; label?: string }
/** slot-only: the accessible name is not optional, because there is no text to read */
type SlotOnly = Base & Rung & { children?: never; label: string }

/*
  IT FORWARDS ITS REF — the same capability `Chip` gained, for the same reason. `Popover`
  anchors to a DOM element, and a button that cannot be pointed at forces every caller to wrap
  it in a span purely to have something to measure. Additive: nothing that does not pass a ref
  changes at all.
*/
export const Button = forwardRef<HTMLButtonElement, WithLabel | SlotOnly>(function Button(props, ref) {
  const {
    variant = 'tonal',
    size = 'medium',
    fieldRung,
    kind = 'button',
    glass = true,
    leading,
    trailing,
    block = false,
    active,
    loading = false,
    children,
    label,
    disabled,
    type = 'button',
    dynamicLight = true,
    ...rest
  } = props as WithLabel & SlotOnly

  /* keyed off whether there is anything to READ, not whether `children` was passed:
     `{cond && 'Save'}` with cond=false hands us `false`, which React draws as nothing
     — treating it as a label would ship a button with an empty label span and no
     aria-label, the exact unnamed control the SlotOnly type exists to make unwritable.
     Same stance as the rect→square correction: the component decides rather than
     trusting every call site. */
  const noLabel = children == null || children === false || children === true || children === ''

  /*
     While loading, the LEFT slot IS the busy indicator: whatever was there is
     replaced, so every form — slot-only included — SHOWS busy rather than merely
     announcing it.

     IT USED TO BE A STILL ICON, and the reason is worth recording because it stopped
     being true. The argument was that a component carries no @media of its own, so a
     spinner's @keyframes would be motion the tokens could not reach and
     reduced-motion users could not escape. Spinner answers that: its keyframes live in
     node.css alongside every other rule, and node.css carries the
     `prefers-reduced-motion` fallback that swaps the travel for a fade. The motion is
     in the stylesheet where motion belongs, so the component does not have to refuse it.

     `label=''` makes it DECORATIVE. Spinner announces itself with role="status" by
     default, which is right when it stands alone — but here the button already carries
     `aria-busy` and its own accessible name, and two announcements for one state is
     one too many.

     IT PASSES NO SIZE, and it used to pass three. `const SPINNER_PX: Record<ButtonSize,
     number> = { small: 12, medium: 14, large: 18 }` sat here on the belief — written in the
     comment this replaces — that "Spinner draws an SVG at a px size and cannot read a custom
     property for its geometry". It can, and it already did: `.nd-btn-slot > svg` sets
     `width` and `height` to `var(--nd-btn-slot)`, and author CSS beats an element's
     presentational `width` attribute. So the table never reached the screen. Measured in
     Storybook before it was deleted: attribute 14, rendered 14 — the var's value, not the
     table's, and identical only because the two agreed.

     CHIP'S COPY OF THE SAME TABLE DID NOT AGREE, which is what makes this worth a note
     rather than a silent tidy: it read 10 / 12 / 14 against an icon ladder of 12 / 14 / 18,
     so the file taught a ladder the kit does not have, and nothing could catch it because
     nothing rendered it. One ladder, in the stylesheet, is the fix for both. */
  const leadSlot = loading ? <Spinner label="" /> : leading

  const slotted = (node: ReactNode) => node != null && node !== false && node !== true && node !== ''

  // only container/ghost ever paint glass — v-primary's ::after never reads
  // --light-angle, so tracking it there would cost a per-frame write for nothing.
  // disabled is excluded unconditionally, dynamicLight=false by the caller's own choice.
  const trackLight = variant !== 'primary' && !disabled && dynamicLight
  return (
    <button
      /*
        TWO REFS, MERGED — because this slot was already taken. `glassLightRef` is a CALLBACK
        ref that registers the element with the dynamic-light tracker, and the forwarded ref
        is the caller's. A second `ref` attribute is a syntax error, and quietly dropping
        either one is worse: drop the caller's and a Popover has nothing to anchor to; drop
        the tracker's and every glass button stops following the light.
      */
      ref={(node) => {
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
        if (trackLight) glassLightRef(node)
      }}
      type={type}
      /* one rung off its ground — the step LevelContext computes, since CSS cannot */
      data-fill={fieldLevel(useLevel())}
      /* primary is the accent surface, so it stands on the scheme's other pole: the
         foundation remaps the ground and ink families for everything inside it */
      /*
        PRIMARY IS THE INVERTED SURFACE, NOT THE ACCENT — and it only ever looked like the accent
        because the accent used to be an absolute. Centring the accent ladder on the family's core
        shade took that away: primary became a mid grey, and its ink FLIPPED mid-ladder (white at
        L1/L2 in dark, black at L3/L4) because the ink is derived per rung and the rungs now cross
        the point where black starts winning. A control whose label changes colour with the rung it
        sits on is not a coherent surface.

        `data-tense="inverted"` stands it on the scheme's OPPOSITE-POLARITY palette instead, where
        ground and ink were authored as a pair and nothing is derived. It is a POLE rather than
        `data-scheme="inverted"` for one reason: DESTRUCTIVE IS A SCHEME here. A control that writes
        its own scheme overrides the one its app put it in, and every destructive primary would turn
        black instead of red. A pole is orthogonal to the scheme, so `error` still reaches
        `error-dark` and stays destructive.
      */
      data-tense={variant === 'primary' ? 'inverted' : undefined}
      className={[
        'nd-btn',
        `v-${variant}`,
        /* the two rungs are one slot in the markup, not two classes that could both land —
           `fr-*` REPLACES `s-*` so nothing downstream has to resolve a conflict the type has
           already made unwritable */
        fieldRung ? `fr-${fieldRung}` : `s-${size}`,
        /*
          WHETHER THIS BUTTON STANDS AT A FIELD'S BOX, said once in the markup rather than
          re-derived in the stylesheet four times.

          Button's ladder is 32 / 50 / 56 and the top two rungs ARE the field ladder (50 and 56),
          as both `fieldRung` values are by construction. What follows from that is not a rung
          fact — it is a fact about the BOX — and the first of them is the corner: a control at a
          field's box takes the field's `--radius-medium`, because equal-looking corners on equal
          boxes are the same number rather than one step apart. `small` alone keeps the tighter
          corner, because at 32 it really is a smaller box.

          It is computed here because the component already knows: the same expression that
          chooses the rung class knows which rungs are field-sized. Written in CSS it would have
          to be spelled out per rung, which is how size-token-test came to report a ladder whose
          `medium` and `large` said the same thing — a true observation about a claim that was
          never about rungs.
        */
        fieldRung || size === 'medium' || size === 'large' ? 'is-fieldbox' : '',
        `k-${noLabel && kind === 'button' ? 'icon-button' : kind}`,
        glass ? '' : 'no-glass',
        block ? 'is-block' : '',
        loading ? 'is-loading' : '',
        active ? 'is-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={noLabel ? label : undefined}
      aria-pressed={active}
      aria-busy={loading || undefined}
      title={label}
      disabled={disabled || loading}
      {...rest}
    >
      {slotted(leadSlot) && (
        <span className="nd-btn-slot" aria-hidden={loading || undefined}>
          {leadSlot}
        </span>
      )}
      {!noLabel && <span className="nd-btn-label">{children}</span>}
      {slotted(trailing) && <span className="nd-btn-slot">{trailing}</span>}
    </button>
  )
})
