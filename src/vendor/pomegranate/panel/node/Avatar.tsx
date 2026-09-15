/*
  Avatar — who this is, in a circle.

  THE PEER WAS READ AND MOSTLY FOLLOWED. `npx astryx component Avatar` gives a real spec, and
  three of its decisions are taken here wholesale because they are right and because agreeing
  with a mature kit is cheaper than re-deriving it:

    the CONTENT IS A CHAIN, not a choice   photo → fallback photo → initials
    `name` does DOUBLE DUTY                it is where the initials come from AND what a
                                           screen reader says
    it is ALWAYS CIRCULAR                  "Don't force a square or custom shape" — a
                                           rectangle in a row of circles reads as a logo

  THE CHAIN IS WHY THERE IS NO `variant` PROP, and it is the same argument the whole kit
  makes about derived state. "Image, initials or icon" sounds like three variants and is
  actually one fallback ladder: you get the photo IF it loads, the initials if it does not.
  A caller who declared `variant="image"` and handed a broken URL would render a variant that
  cannot draw itself. So the content is derived from what resolves, at runtime, and the
  `onError` handler is the whole mechanism.

  `name` IS REQUIRED, which is where this parts company with the peer and with its own last
  fallback. Astryx ends the chain with a person silhouette for the case where there is no
  photo AND no name — and this kit's icon catalogue has no person glyph, so that ending is not
  available without a foundation change (node-kit-test forbids hand-drawing one). Requiring
  the name removes the need for it: initials can always be derived, an avatar can never be
  anonymous, and the accessible name can never be missing. The unnamed avatar is unwritable
  rather than discouraged.

  THE ICON IS AN OVERRIDE, NOT A FALLBACK. It is still offered — a team, a bot, a system
  actor — but as a deliberate choice that outranks the initials, because those things have
  names and would otherwise draw two letters that mean nothing.

  `kind` IS THE ONE THING THAT BENDS THE INITIALS RULE, and it bends it in exactly one place:
  a name of a single token. A person with one token has a MISSING SURNAME and gets one letter;
  an organisation with one token has its WHOLE NAME and gets two (DIM-24). It is a hint about
  what the string means, not a variant — the mark still comes from `name`, and `name` is still
  what a screen reader says. That is why it is not an `initials` override: an override would
  let the drawn letters and the announced name disagree, and this component's first rule is
  that they cannot.

  THE BADGE FLOATS, AND IT ANCHORS WHEREVER THE CALLER SAYS. The peer offers exactly one
  corner (`status`, bottom-right). Five anchors are offered here because presence is not the
  only thing that rides an avatar — a count, a role marker, a verification tick all want
  different corners, and a bottom-CENTRE anchor is what a label-under-a-face wants. The names
  are LOGICAL (`start`/`end`, not left/right) so a right-to-left document mirrors them for
  free, which `left`/`right` could not do.

  THE BADGE IS DECORATION, LIKE EVERY OTHER SLOT IN THIS KIT — pointer-inert, so if an avatar
  is ever wrapped in something pressable the badge cannot become a second target. It also
  wears a ring in the page's own background colour, which is what keeps a dark dot legible
  where it overlaps a dark photo.

  WHAT IT IS NOT FOR: logos, product shots, thumbnails. The peer says so and the reason is
  the circle — crop a product into one and you have damaged the product.
*/
import type { CSSProperties, ReactNode } from 'react'
import { forwardRef, useEffect, useState } from 'react'

/* the avatar's own rungs (22 / 32 / 40, not the row ladder) — see Checkbox for why the TYPE is `ButtonSize` */
import type { ButtonSize } from './Button'
import { fieldLevel, useLevel } from './LevelContext'

export type AvatarSize = ButtonSize

/*
  WHERE THE BADGE SITS. Logical names, so RTL mirrors them without a second vocabulary.
  `bottom-center` is the odd one and earns its place: it is what a status STRIP wants — a
  short word under a face rather than a dot beside it.
*/
export type AvatarBadgeAt = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'bottom-center'

/*
  WHAT THE NAME NAMES. It selects the one-token initials rule and nothing else — see
  `initialsOf`. It is not a visual variant: an organisation is still a circle, still derives
  its mark from `name`, still announces `name`. Anything that changes what is DRAWN rather
  than how the name is READ belongs to the src/icon chain instead.
*/
export type AvatarKind = 'person' | 'organisation'

export type AvatarProps = {
  /*
    REQUIRED, AND IT DOES TWO JOBS: it is where the initials come from and what a screen
    reader announces. There is no way to render an avatar that stands for nobody.
  */
  name: string
  /*
    WHETHER `name` NAMES A PERSON OR AN ORGANISATION, which selects the one-token initials
    rule and nothing else (DIM-24). Defaults to `person`, so every existing call site keeps
    the behaviour it had. A client, vendor, workspace or team list wants `organisation`, where
    one word is the common case rather than the edge one.

    THIS RATHER THAN AN INITIALS OVERRIDE, and the reason is the rule at the top of this file:
    `name` does double duty. An `initials` prop would let a caller draw letters unrelated to
    the accessible name, which is the one property the whole component is built on.
  */
  kind?: AvatarKind
  /** the photo. If it fails to load the chain falls through to `fallbackSrc`, then to the
      initials — which is why `variant` does not exist */
  src?: string
  /** a second photo to try before giving up on images entirely */
  fallbackSrc?: string
  /*
    AN OVERRIDE, NOT A FALLBACK — a team, a bot, a system actor. It outranks the initials
    because those things have names whose first letters mean nothing.
  */
  icon?: ReactNode
  /*
    THE RUNG, or a number. The three names are the avatar's own — 22 / 32 / 40, a leading-slot
    size rather than a row height (not the row ladder) — so an avatar drops into a ListItem's
    leading slot or a Chip's and sits centred among everything else in the row.

    A NUMBER LEAVES THE LADDER DELIBERATELY, and the peer allows the same. A profile header is
    the case: there the avatar is the SUBJECT rather than a member of a row, so no rung
    describes it and pretending one does would be worse than escaping.
  */
  size?: AvatarSize | number
  /** anything that rides the circle — a presence dot, a count, a tick. Decoration only */
  badge?: ReactNode
  badgeAt?: AvatarBadgeAt
  /*
    WHEN THE NAME IS ALREADY IN THE TEXT BESIDE IT. A ListItem whose title IS the person's
    name gets the name announced twice — once by the row, once by the avatar. This hides the
    avatar from the tree without taking the initials off the screen. Spinner's `label=""`
    makes the same move for the same reason.
  */
  decorative?: boolean
  /** placement only — margin and grid position belong to the layout that holds it */
  style?: CSSProperties
}

/*
  TWO LETTERS, FROM THE ENDS OF THE NAME. "Dimitris Sarantidis" → DS; "Ada B. Lovelace" → AL,
  because the middle initial is not what anyone recognises the person by. Non-letters are
  dropped before the split so "  dimitris   " and "@dimitris" both work.

  THE ONE-TOKEN CASE IS THE ONLY PLACE `kind` CHANGES ANYTHING, and it is why the prop exists
  (DIM-24). "Dimitris" is a person whose SURNAME IS MISSING, so `D` is honest: a second letter
  would invent precision the name does not carry. "Desquared" is an organisation, which has no
  second word to be missing — the single token IS the whole name, so `D` is not a shortened
  name but a shortened WORD, and it is also the weakest mark available: Stripe, Shopify and
  Square all draw `S`, in a component whose entire job is telling one row from the next.

  MULTI-TOKEN NAMES ARE IDENTICAL FOR BOTH KINDS, deliberately. The ticket names the one-word
  case as the defect and nothing else, and "Acme Corp" → AC is already right. Splitting the
  multi-token rule by kind would be inventing a second behaviour nobody asked for.

  UPPERCASED IN CSS, NOT HERE — `text-transform` keeps the accessible name the caller's own
  string, where a `toUpperCase()` in the markup would shout it at a screen reader too.
*/
export function initialsOf(name: string, kind: AvatarKind = 'person'): string {
  const parts = name
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0].slice(0, kind === 'organisation' ? 2 : 1)
  return parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)
}

/*
  …AND WHERE THE CIRCLE IS TOO SMALL FOR TWO OF THEM, IT DRAWS ONE.

  THE THRESHOLD IS NOT HAND-PICKED — it is the exact point at which the `max()` in
  `.nd-avatar-initials` stops returning the ratio and starts returning the floor, which is
  `microcopy` times the ratio the initials scale by. Above it the letters are proportional to
  the circle that holds them; below it the circle keeps shrinking and the letters stop, and
  that divergence is the whole of the problem.

  BECAUSE TWO LETTERS STOP FITTING THERE, AND ONLY THERE. Measured in GT Ultra at `small`: the
  circle is 22 across its equator but only 20.33 across the band the capitals actually occupy,
  while two capitals run 18.7 to 24.4 wide. Every pair crosses the ring at that rung and the
  widest clears it by 4.1. Above the threshold nothing is wrong and nothing changes — `WW` is
  27.1 inside a budget of 30.6 at `medium`, and 33.9 inside 38.3 at `large`.

  NEITHER OBVIOUS REPAIR WORKS, and both were measured before this one was written. Closing the
  tracking to zero recovers 0.49 of the 4.1: the widest pair still spills, so it buys a rounding
  error and the appearance of a fix. Clipping is worse than the overflow it removes — the span
  centres at the circle's width and overflows rightward only, so it amputates one stem flat
  against the edge, which trades a legible overflow for an illegible drawing and defeats the
  floor it was meant to serve.

  SO THE COUNT IS WHAT GIVES, because the other two terms are both right: the floor is right
  (a drawing made of letters still has to be read) and 22 is right (it is what keeps a face off
  the row's top and bottom edges). A frame with no room for two marks holds one. The widest
  capital is 12.45 and always fits.

  THE NAME IS UNTOUCHED. `initialsOf` still derives two, the announced name is still the
  caller's whole string, and only the DRAWING is shortened.
*/
/* `--type-microcopy-size` × the ratio `.nd-avatar-initials` scales by. Both numbers
   are read back out of the stylesheet by node-kit-test §22, so this cannot drift from them. */
const ONE_LETTER_BELOW = 12 * 2.4
/* the rungs that land under it — also derived rather than declared, by the same gate */
const ONE_LETTER_RUNGS: AvatarSize[] = ['small']

/*
  IT FORWARDS ITS REF, so it can be a Tooltip's trigger or a Popover's anchor. Those two clone
  or measure the element they are given, and a component that swallows the ref leaves them
  pointing at nothing — React says so out loud ("Function components cannot be given refs"),
  which is exactly how this was found: a Tooltip round a truncated Tag warned twice on mount.
*/
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar({
  name,
  kind = 'person',
  src,
  fallbackSrc,
  icon,
  size = 'small',
  badge,
  badgeAt = 'bottom-end',
  decorative = false,
  style,
}, ref) {
  /*
    THE CHAIN, AS STATE. `step` is how far down it we have fallen: 0 is `src`, 1 is
    `fallbackSrc`, 2 is "no image survived". It resets when the sources change, because a
    component that remembered a failure would refuse to draw the NEXT person's photo — the
    kind of bug that only appears in a virtualised list.
  */
  const [step, setStep] = useState(0)
  useEffect(() => setStep(0), [src, fallbackSrc])

  const sources = [src, fallbackSrc].filter(Boolean) as string[]
  const current = sources[step]

  const numeric = typeof size === 'number'
  /* two letters, then one where the circle has no room for two — see ONE_LETTER_BELOW */
  const initials = initialsOf(name, kind)
  const drawn = (numeric ? size < ONE_LETTER_BELOW : ONE_LETTER_RUNGS.includes(size))
    ? initials.slice(0, 1)
    : initials

  return (
    <span
      ref={ref}
      /*
        ONE RUNG OFF ITS GROUND — the step LevelContext computes, since CSS cannot. Without
        the attribute `--nd-field-fill` is undeclared (it lives in exactly one block, keyed on
        `[data-fill]`), so `background: var(--nd-field-fill)` is invalid at computed-value time
        and this surface paints NOTHING. Invisible on a matching ground, which is how it
        shipped; a 72-coordinate browser sweep is what found it.
      */
      data-fill={fieldLevel(useLevel())}
      className={['nd-avatar', numeric ? '' : `s-${size}`].filter(Boolean).join(' ')}
      style={numeric ? { ...style, ['--nd-avatar-size' as string]: `${size}px` } : style}
      /* the whole thing announces as ONE image with a name — the letters inside are a
         drawing, not text to be read out */
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      title={name}
    >
      {current ? (
        <img
          /*
            KEYED BY STEP, and this is not a React nicety — it is the whole reliability of the
            chain. Without it, falling from `src` to a `fallbackSrc` that happens to be the
            SAME URL updates an attribute on the same element, so the browser attempts no new
            load, `onError` never fires a second time, and the avatar sits on the broken-image
            glyph forever. Measured exactly that way on the specimen sheet. A key mounts a
            fresh element per step, so every step really is attempted and really can fail.
          */
          key={step}
          className="nd-avatar-img"
          src={current}
          /* the name is on the wrapper, so the img must not repeat it */
          alt=""
          onError={() => setStep((s) => s + 1)}
          draggable={false}
        />
      ) : icon ? (
        <span className="nd-avatar-glyph" aria-hidden>
          {icon}
        </span>
      ) : (
        <span className="nd-avatar-initials" aria-hidden>
          {drawn}
        </span>
      )}
      {badge != null && (
        <span className={`nd-avatar-badge at-${badgeAt}`} aria-hidden>
          {badge}
        </span>
      )}
    </span>
  )
})
