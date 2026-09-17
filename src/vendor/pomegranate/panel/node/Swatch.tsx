/*
  Swatch — the native colour picker, as a chip.

  IT LIVES IN ITS OWN FILE, and the argument is worth making because it is
  tempting to fold it into the text field as `type="color"`. A native colour
  input shares exactly three things with a text box — a value, an onChange, and
  a name — and shares nothing else. It has no placeholder (there is no empty
  state; it is always some colour). It cannot be multiline. It cannot be typed
  into, so size, autoFocus and onKeyDown are all meaningless on it. Its value is
  not free text but a constrained `#rrggbb`, and the two sites that use one pair
  it WITH a text field for exactly that reason: the swatch picks, the field is
  where you paste. Folding them together buys one import and costs a component
  whose props are mostly inert on half its instances, plus the invitation to
  write `<TextField type="color" multiline rows={4}>` and have it type-check.
  Two small honest components beat one component with a dead half — which is
  also why this is no longer a second export sharing TextField's file.
*/

/**
 * The popup is the OS's for the same reason DropDownSelect's list is: it is
 * drawn outside the page, so the card's `overflow: hidden` cannot clip it and
 * the canvas transform cannot displace it. Nothing here to style but the chip.
 *
 * Left out on purpose: `disabled`/`readOnly`/a floating label do not have an
 * equivalent question here — there is no "value" to make illegible, and no
 * empty state to caption.
 */
export function Swatch({
  value,
  onChange,
  label,
}: {
  /** a `#rrggbb`. The native control accepts nothing else, so neither does this. */
  value: string
  onChange: (value: string) => void
  label: string
}) {
  /*
    THE PRECONDITION, ENFORCED. The native control reads any unparseable value
    as #000000 and offers no way to say so — the spec's black lie. The board
    app's two call sites (both deleted with it) each grew a guard against it,
    and the guards drifted: one hid the chip behind its own HEX6 test, the
    other coerced the draft to a grey that was not the value — the precise lie
    the swatch/field pairing exists to prevent. Two sites, two answers, is the
    five-classnames disease in miniature, so the guard is the component's own: a chip that cannot show
    "not a colour yet" disappears rather than lying about the colour.
  */
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null
  return (
    <input
      className="nd-swatch"
      type="color"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
