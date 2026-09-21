// generateScheme — one seed hex → a full runtime scheme, light and dark.
//
// This is the runtime sibling of the token pipeline. `npm run tokens` mints the
// nine SHIPPED schemes (neutral … warning) from the JSON, validated by the 13
// suites. This mints a TENTH, `custom`, at runtime from a user's hex — the one
// thing the build-time pipeline can't do, because the seed isn't known until a
// visitor types it.
//
// It emits EXACTLY the variable contract `[data-scheme='brand']` emits, so every
// component recolours with zero changes: components spend only `--surface`,
// `--background`, `--accent`, `--mark`, `--text*`, `--stroke*` — never a hex.
//
// Because this bypasses the contrast suite the JSON path runs, the WCAG guardrail
// below (text/surface and text-on-accent/accent ≥ 4.5:1) stands in for it. It is
// the load-bearing part: without it the generator will happily mint an unreadable
// skin. See docs/COLOR-TOKEN-RULES.md for the role census this map approximates.
//
// SHAPE: the role tables resemble the NEUTRAL scheme, not brand — surfaces,
// containers, text and strokes read from a near-grey ramp (a whisper of the seed
// hue), and only the accent + links carry the seed at full chroma. The
// `data-level` ladder is minted too (below), so `data-scheme="custom"` on the
// root is a whole-ground repaint, not just an island skin.

export type SchemeVars = Record<string, string>

// ── sRGB ↔ OKLCH ───────────────────────────────────────────────────────────
// OKLCH, not HSL: stepping lightness in a perceptual space keeps the ramp's
// steps visually even instead of bunching in the yellows and greens.
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}
function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function rgbToOklch([r, g, b]: [number, number, number]): [number, number, number] {
  ;[r, g, b] = [r, g, b].map(srgbToLin) as [number, number, number]
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180) / Math.PI]
}
function oklchToRgb([L, C, H]: [number, number, number]): number[] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h), bb = C * Math.sin(h)
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  return [r, g, b].map(linToSrgb).map(clamp01)
}

// ── WCAG contrast — the guardrail's judge ──────────────────────────────────
const luminance = ([r, g, b]: [number, number, number]) => {
  ;[r, g, b] = [r, g, b].map(srgbToLin) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(hexA: string, hexB: string): number {
  const la = luminance(hexToRgb(hexA)), lb = luminance(hexToRgb(hexB))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── 1. seed → a 29-stop ramp at the neutral scale's own lightnesses ────────
// These are the OKLCH lightnesses of core-colours.neutral (5…825), so the runtime
// ramp covers every rung the shipped foundation uses — a grey seed reproduces the
// neutral ground, and any hue is a faithful re-hue of it at full resolution.
// Chroma tapers toward the extremes because no real palette stays saturated as it
// approaches white or black — a flat-chroma ramp reads as neon at the ends.
const L_STOPS = [
  0.991, 0.985, 0.97, 0.961, 0.952, 0.949, 0.937, 0.918, 0.9, 0.875, 0.854, 0.823, 0.785, 0.77, 0.703,
  0.676, 0.583, 0.556, 0.489, 0.46, 0.42, 0.417, 0.375, 0.348, 0.301, 0.269, 0.218, 0.2, 0.178,
  // one near-black stop below neutral.825 (≈1.5% HSL). ONLY the dark L1 surface reads it,
  // so the recessed level can hug black without pulling the roles below neutral.825.
  0.1,
]
const LAST = L_STOPS.length - 1 // 29
export function rampFromHex(seedHex: string, chromaScale = 1): string[] {
  const [, Cseed, H] = rgbToOklch(hexToRgb(seedHex))
  const C0 = Cseed * chromaScale
  return L_STOPS.map((L) => {
    const taper = 1 - Math.abs(L - 0.5) * 1.35
    const C = Math.max(0.004, C0 * Math.max(0.25, taper))
    return rgbToHex(oklchToRgb([L, C, H]))
  })
}

// Mirror the NEUTRAL scheme, not brand: surface/container/text/stroke/nd-fill
// read from a near-grey ramp (a whisper of the seed hue), and only the ACCENT
// (and links) carry the seed at full chroma — so a word paints a neutral ground
// with a coloured accent, the way `[data-scheme='neutral']` does. Set to 0 for a
// perfectly neutral (hueless) grey.
const NEUTRAL_CHROMA = 0.14

// ── 2. role → ramp-index map (neutral ground; accent from the seed) ─────────
// One ramp, read from opposite ends: light reads the pale end for surfaces and
// the deep end for text; dark mirrors it. hover/pressed are index shifts in the
// theme's "deeper" direction; disabled collapses toward a muted mid stop.
const GLASS = 0.5
const glass = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c * 255))
  return `rgba(${r},${g},${b},${GLASS})`
}
const at = (r: string[], i: number) => r[Math.min(LAST, Math.max(0, i))]

/*
  A STATE IS A MEASURED AMOUNT, NOT AN INDEX SHIFT.

  This skin stepped hover and pressed by `+1` and `+2` positions on the 29-stop ramp, and the
  ramp's lightnesses bunch at its ends, so what those positions were WORTH varied wildly: the
  accent-extra-dominant rung moved 1.01:1 on hover and 1.03:1 on press — nothing at all — while
  the same shift near the middle moved 1.46:1. An index is not a perceptual quantity.

  So the runtime asks for the same amounts the foundation now authors, in the same metric:
  OKLab lightness, ΔL 0.055 for hover and 0.100 for pressed. The ramp is BUILT at the
  lightnesses in `L_STOPS`, so the distance between two positions is read off that array
  directly rather than reconstructed from the hexes.

  The three rules the shipped file obeys are obeyed here too, for the same reasons: both states
  travel the SAME WAY (a control whose hover lightens and press darkens has two unrelated
  colours, not an axis), press travels FURTHER than hover, and neither crosses the point where
  the surface's own ink would drop under 4.5:1 — which is what stops a label flipping colour
  when you hover it. A direction with no room turns round rather than standing still.
*/
const STATE_STEP = { hover: 0.055, pressed: 0.1 }
const stateIndices = (r: string[], i: number, dir: 1 | -1, ink?: string) => {
  const pick = (want: number, d: 1 | -1, minTravel: number) => {
    let best = -1
    let bestMiss = Infinity
    for (let j = i + d; j >= 0 && j <= LAST; j += d) {
      /* contrast against a fixed ink is monotonic along the ramp, so the first failure ends it */
      if (ink && contrast(r[j], ink) < 4.5) break
      const travel = Math.abs(L_STOPS[j] - L_STOPS[i])
      if (travel <= minTravel) continue
      const miss = Math.abs(travel - want)
      if (miss < bestMiss) { bestMiss = miss; best = j }
    }
    return best
  }
  for (const d of [dir, (-dir) as 1 | -1]) {
    const hover = pick(STATE_STEP.hover, d, 0)
    if (hover < 0) continue
    const pressed = pick(STATE_STEP.pressed, d, Math.abs(L_STOPS[hover] - L_STOPS[i]))
    if (pressed < 0) continue
    return { hover, pressed }
  }
  /* neither way could seat both — fall back to the old neighbours rather than emitting nothing */
  return { hover: Math.min(LAST, Math.max(0, i + dir)), pressed: Math.min(LAST, Math.max(0, i + dir * 2)) }
}

/*
  THE ROLE MAP FOLLOWS THE CONTRACT, AND THE CONTRACT COLLAPSED.

  It used to name six fills — `surface`, `surfaceUnder`, `c1`…`c4` — plus `ndFill`, because
  the shipped stylesheet published a variable per rung. There is one fill name now,
  `--background`, and WHICH rung it holds is `data-level`'s answer; the ladder below mints
  it per level exactly as the build does.

  `accent` is a LADDER now too, four rungs like the ground's, and the four indices here are
  the runtime's reading of it: recessive at `accentSubtle`, the seed at `accent`, and two
  steps further from the ground for the rungs above. They step AWAY from the surface (down
  the ramp in light, up in dark), which is what makes `--text-on-accent` hold as the rung
  rises — the same rule the build's own ladder derives (migrate-fill-collection, DOMINANCE
  IS DISTANCE FROM THE GROUND).
*/
type RoleMap = {
  background: number; stroke: number; strokeSubtle: number
  accentSubtle: number; accent: number; accentDominant: number; accentExtra: number
  text: number; textDom: number; textRec: number; textLink: number
}
// Indices into the 29-stop ramp, read off the shipped neutral scheme's real stops
// (neutral.150 = surface = index 9, neutral.775 = text = 26, …). Accent + links are
// the exception: they read the full-chroma ramp at a rich mid-deep stop (light) /
// mid-light stop (dark), so the seed's colour survives there and nowhere else.
//
// STROKE IS A DELIBERATE DIVERGENCE from those neutral stops. The shipped scheme
// expresses strokes as a whisper — solid neutral.125/175 in light (a hairline ~1.07:1
// off its surface), a translucent white overlay in dark (~1.9:1) — because there the
// container boundary is carried by the fill LIFT, not the stroke. The runtime skin
// reproduced only the light indices as SOLID stops, so dark strokes came out at a
// blazing 15:1 (a solid near-white stop, not the 12/22% overlay) while light strokes
// stayed invisible: crisp borders in dark, none in light. This skin instead pins both
// modes to a visible-hairline band — stroke ≈ 2.8:1, stroke-subtle ≈ 2.0:1 against the
// surface, and steady across seeds (the near-grey ramp's luminance barely moves with
// hue) — so tag borders and dividers read the same in light and dark. Solid stops, no
// alpha: light climbs to a mid stop, dark drops to one; the two land at matched contrast.
const LIGHT: RoleMap = { background: 9, stroke: 16, strokeSubtle: 15, accentSubtle: 18, accent: 21, accentDominant: 24, accentExtra: 26, text: 26, textDom: 23, textRec: 19, textLink: 21 }
const DARK: RoleMap = { background: 26, stroke: 18, strokeSubtle: 20, accentSubtle: 16, accent: 13, accentDominant: 9, accentExtra: 5, text: 5, textDom: 10, textRec: 15, textLink: 13 }

const DISABLED_MID = 16 // the muted mid stop (neutral.425) disabled ink falls back to

// Two ramps: `g` is the near-grey ground (surfaces, text, strokes, nd-fill);
// `a` is the seed at full chroma, used ONLY for accent + links.
function block(g: string[], a: string[], M: RoleMap, dir: 1 | -1): SchemeVars {
  const vars: SchemeVars = {}

  // AA guardrail: push `text` away from `--background` until it clears 4.5:1 (on grey).
  let textIdx = M.text
  const edge = dir > 0 ? LAST : 0
  while (contrast(at(g, textIdx), at(g, M.background)) < 4.5 && textIdx !== edge) textIdx += dir

  /* three states for a fill role. `solid` keeps it opaque — the ground and the strokes;
     everything else is the 50%-alpha layer the glass material publishes. */
  const fill = (name: string, i: number, solid: boolean, r: string[]) => {
    const w = solid ? (x: string) => x : glass
    const st = stateIndices(r, i, dir)
    vars[`--${name}`] = w(at(r, i))
    vars[`--${name}-hover`] = w(at(r, st.hover))
    vars[`--${name}-pressed`] = w(at(r, st.pressed))
    /* the disabled reading settles onto the rung below the ground, which is where the
       shipped ladder puts it too — one flat tone, no height */
    vars[`--${name}-disabled`] = w(at(r, M.background + dir))
  }
  const ink = (name: string, i: number, r: string[]) => {
    const st = stateIndices(r, i, dir)
    vars[`--${name}`] = at(r, i)
    vars[`--${name}-hover`] = at(r, st.hover)
    vars[`--${name}-pressed`] = at(r, st.pressed)
    vars[`--${name}-disabled`] = at(r, DISABLED_MID)
  }

  // the ground — one fill name, at the level this block is being minted for
  fill('background', M.background, true, g)
  ink('text', textIdx, g)
  ink('text-dominant', M.textDom, g)
  ink('text-recessive', M.textRec, g)
  fill('stroke', M.stroke, true, g)
  fill('stroke-subtle', M.strokeSubtle, true, g)

  /*
    THE POLE'S PLUMBING, and this mint is load-bearing rather than decorative.

    `accent` is not a published role any more — `tense/strong` owns the surface and `mark`
    owns the colour-on-the-ground. What the foundation still emits is `--nd-pole-fill`, the
    private name the generated pole block reads: `[data-tense='strong'] { --background:
    var(--nd-pole-fill) }`. A runtime scheme that did not mint it would leave every strong
    surface inside itself reading the SHIPPED scheme's accent, because the reference resolves
    against whatever is inherited — a primary button in a custom skin painting the stock
    colour, silently and only under `strong`.
  */
  fill('nd-pole-fill', M.accent, true, a)
  /*
    `mark` — the scheme's colour drawn ON the ground: a focus ring, a field's focus or invalid
    border, an accent glyph, a chart stroke. It is the same stop the accent is made of, and it
    is SOLID, which here is free: this minter has always passed `solid: true` for the accent,
    where the shipped foundation authors it as the glass material. That divergence is exactly
    why the split was needed — a ring drawn from a surface token is half-transparent, and in
    the shipped schemes it measured 1.96:1 against its own ground.

    It is minted HERE and deliberately not in `levelVars`: `mark` does not ladder. Checked
    against all four ground rungs across nine schemes and two themes, the worst boundary
    reading is 3.82:1, clear of the 3:1 floor everywhere, so a ring that stays put is a ring
    that stays visible.
  */
  fill('mark', M.accent, true, a)
  ink('text-link', M.textLink, a)
  // text-on-accent: whichever of black/white wins contrast on the accent fill.
  const accent = at(a, M.accent)
  vars['--text-on-accent'] = contrast('#FFFFFF', accent) >= contrast('#000000', accent) ? '#FFFFFF' : '#000000'

  /*
    THE INVERTED POLE'S PLUMBING, same reason as the strong pole above and by the same mechanism.

    `data-tense="inverted"` reads six roles through six `--nd-inv-*` names. A runtime scheme that
    did not mint them would leave every INVERTED surface inside itself — a primary Button, a
    primary Tag, a chosen chip — reading the ROOT's neutral inverted (near-black in light,
    near-white in dark), silently, regardless of the seed. The visible defect was a Button that
    stayed black on a coral card.

    The pole reaches ACROSS themes: the inverted of a light-theme scheme is that scheme's DARK
    reading, and the reverse in dark. That is the same rule `migrate-inverted-pole.mjs` uses for
    the built-in schemes (mode-of-opposite-polarity). Here the "other theme's reading" is the
    opposite RoleMap — indices flipped, direction negated — walked on the SAME two ramps.

    STATE STEPS COME WITH THE POLE. When the current theme is light, this pole is dark, so its
    hover/pressed steps deepen in the DARK direction (up the ramp). That is what negating `dir`
    into `-dir` for the inverted mint buys — the states move the right way from the inverted
    rung's own point of view, not from the tonal ground's.

    INK IS DERIVED, MATCHING THE SHIPPED RULE: whichever of black/white wins on the inverted
    rung. The ladder is single-tone (text/dominant/recessive/link/mark all read the same base
    contrast pair) because there is no separate ink ramp on the twin theme to walk; the
    difference from the shipped inverted pole is exactly the difference already present in the
    strong pole, and it is on the same axis (the runtime can't ladder ink).
  */
  const invRoles = dir > 0 ? DARK : LIGHT
  const invDir: 1 | -1 = -dir as 1 | -1
  const invFill = (name: string, i: number) => {
    const st = stateIndices(g, i, invDir)
    vars[`--${name}`] = at(g, i)
    vars[`--${name}-hover`] = at(g, st.hover)
    vars[`--${name}-pressed`] = at(g, st.pressed)
    vars[`--${name}-disabled`] = at(g, invRoles.background + invDir)
  }
  const invFillHex = at(g, invRoles.background)
  const invInkHex = contrast('#FFFFFF', invFillHex) >= contrast('#000000', invFillHex) ? '#FFFFFF' : '#000000'
  invFill('nd-inv-background', invRoles.background)
  for (const role of ['text', 'text-dominant', 'text-recessive', 'text-link', 'mark'] as const) {
    vars[`--nd-inv-${role}`] = invInkHex
    vars[`--nd-inv-${role}-hover`] = invInkHex
    vars[`--nd-inv-${role}-pressed`] = invInkHex
    vars[`--nd-inv-${role}-disabled`] = invInkHex
  }

  return vars
}

/** The full role set for one theme, as a `{ '--surface': '#…' }` map. */
export function generateSchemeVars(seedHex: string, theme: 'light' | 'dark'): SchemeVars {
  const g = rampFromHex(seedHex, NEUTRAL_CHROMA) // near-grey ground
  const a = rampFromHex(seedHex) // the seed, full chroma — accent only
  return theme === 'light' ? block(g, a, LIGHT, +1) : block(g, a, DARK, -1)
}

const toDecls = (vars: SchemeVars) =>
  Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')

// ── 4. the level ladder, per scheme — closing the whole-ground gap ─────────
// The shipped `data-level` blocks hard-code neutral greys, so a scheme on its
// own never repaints a raised Card's *surface* — which is why `custom` was an
// island skin. To repaint the whole ground we mint the ladder too, scoped to
// this scheme, deriving each level's surface from the same ramp. Light climbs
// toward the pale end, dark toward the deep end; `surface-under` sits one stop
// deeper, and hover/pressed step in the theme's "deeper" direction (the `dir`
// the role block already uses). Emitted only for the runtime skin — the shipped
// schemes keep their neutral elevation.
// L1…L4 surface indices. Light matches the shipped neutral [data-level] blocks
// (neutral.200/150/85/5). Dark keeps L2–L4 on 775/725/700 but drops L1 onto the
// near-black extension stop (~1.5%) so the recessed rung reaches black instead of
// stopping at neutral.825's 7%. Every pair still clears the six-pair guarantee
// (weakest ≈ 1.11, well over the 1.08 floor) for any seed, so cards stay tellable apart.
const LEVELS_LIGHT = [11, 9, 6, 0]
const LEVELS_DARK = [29, 26, 25, 24]
/*
  AND THE ACCENT LADDER PER LEVEL, stepping AWAY from each rung's ground — down the ramp in
  light, up in dark — so `--text-on-accent` holds as the surface lightens. These are the
  runtime's reading of the four rungs the build derives per palette.
*/
const ACCENT_LIGHT = [19, 21, 23, 25]
const ACCENT_DARK = [15, 13, 11, 9]

function levelVars(g: string[], _a: string[], idx: number, _accentIdx: number, dir: 1 | -1): SchemeVars {
  const s = at(g, idx)
  const ground = stateIndices(g, idx, dir)
  /*
    Only the GROUND ladders per level. The pole (`--nd-pole-fill` + states) is pinned at
    the scheme level in `block()` above — one brand shade per scheme, per theme, read
    at every level. It used to override here too, one accent rung per level, on the
    argument that "a raised card carries a stronger accent". That argument was for a
    CONTROL — a primary button on a raised card, whose fill has to step away from its
    ground to keep text-on-accent legible — and it silently applied to the POLE, which
    is what a whole card says when it declares `data-tense="strong"`. The consequence
    was that Claude's coral rendered as a deep brown at ledger's `NEIGHBOUR_LEVEL[4]=3`
    subscription rows: the pole showed a level-relative rung, never the seed. The pin
    lives in `block()` at `M.accent` (light=21, dark=13, the level-2 rung), which is
    what a bare page shows today — cards at levels 1, 3, 4 now match. `--mark` was
    already level-invariant (see the note where it is minted); the pole joins it.

    `accentIdx` and `_a` are kept in the signature because the call site still passes
    them from `ACCENT_LIGHT/DARK` — leaving the arrays untouched keeps the archived
    reasoning readable next to the fix. A follow-up can retire both once the change
    settles.
  */
  return {
    '--background': s,
    '--background-hover': at(g, ground.hover),
    '--background-pressed': at(g, ground.pressed),
  }
}

// ── 5. the solid-surface override, per scheme — closing the glass-off gap ────
// `data-surface="normal"` is the "ground is never glass" mode: it takes the glass
// off a subtree and stands it on the opaque ground. The shipped block does that by
// re-pinning the three GLASS containers (1/3/4) and surface-under's interaction
// states to OPAQUE NEUTRAL stops. A scheme on its own never repaints those, so
// under it a custom skin's containers fell back to grey — a card in a solid-surface
// region (`.nd-card.u-3` paints `linear-gradient(var(--background))` at its own rung) read neutral
// while its surface and nd-fill re-hued, the exact split reported on the live site.
// We mint the same contract re-hued and opaque, scoped under the scheme (adds a
// `[data-scheme]` attribute → 0,3,1 in dark beats the shipped 0,2,1, no `!important`).
// Container-2 is already solid and nd-fill stays glass here — the shipped block
// leaves both alone, so we do too. Opaque throughout: this is the glass-off ground.
function solidSurfaceVars(g: string[], M: RoleMap, dir: 1 | -1): SchemeVars {
  const vars: SchemeVars = {}
  const solid = (name: string, i: number) => {
    const st = stateIndices(g, i, dir)
    vars[`--${name}`] = at(g, i)
    vars[`--${name}-hover`] = at(g, st.hover)
    vars[`--${name}-pressed`] = at(g, st.pressed)
    vars[`--${name}-disabled`] = at(g, M.background + dir)
  }
  /* one fill, so one line: the ground, opaque, with its states. `data-surface="normal"`
     is the way out of glass, and with the rungs collapsed there is nothing else to pin. */
  solid('background', M.background)
  return vars
}

/**
 * A ready-to-inject stylesheet string: the `[data-scheme='<name>']` block plus
 * its `html[data-theme='dark'] …` counterpart, matching the exact selector shape
 * the shipped schemes use so the site's existing dark switch drives it for free.
 * It also mints the `data-level` elevation ladder scoped to the scheme, so a
 * whole-page `data-scheme` (not just an island) repaints raised Cards too.
 */
export function generateSchemeCss(seedHex: string, name = 'custom'): string {
  const rGrey = rampFromHex(seedHex, NEUTRAL_CHROMA) // levels share the neutral ground
  const rAccent = rampFromHex(seedHex) // …and the accent ladder rides the seed at full chroma
  const light = generateSchemeVars(seedHex, 'light')
  const dark = generateSchemeVars(seedHex, 'dark')
  const sel = `[data-scheme='${name}']`

  let css =
    `${sel} {\n${toDecls(light)}\n}\n` +
    `html[data-theme='dark'] ${sel},\n` +
    `html[data-theme='dark']${sel} {\n${toDecls(dark)}\n}\n`

  // The elevation ladder, scoped under the scheme (0,2,0 beats the 0,1,0 neutral
  // `[data-level]` blocks, so no `!important` and no ordering dependency).
  for (let i = 0; i < 4; i++) {
    const lvl = i + 1
    css +=
      `${sel} [data-level='${lvl}'],\n${sel}[data-level='${lvl}'] {\n` +
      `${toDecls(levelVars(rGrey, rAccent, LEVELS_LIGHT[i], ACCENT_LIGHT[i], +1))}\n}\n` +
      `html[data-theme='dark'] ${sel} [data-level='${lvl}'],\n` +
      `html[data-theme='dark']${sel} [data-level='${lvl}'],\n` +
      `html[data-theme='dark'] ${sel}[data-level='${lvl}'],\n` +
      `html[data-theme='dark']${sel}[data-level='${lvl}'] {\n` +
      `${toDecls(levelVars(rGrey, rAccent, LEVELS_DARK[i], ACCENT_DARK[i], -1))}\n}\n`
  }

  // The solid-surface override — `data-surface="normal"` takes the glass off and
  // stands on the opaque ground. Scoped under the scheme so its containers re-hue
  // too; without it any card in a solid-surface region falls back to neutral grey
  // (the shipped block hard-codes opaque neutral containers there). Both light and
  // dark, matching the shipped selector shape so the site's dark switch drives it.
  const dsl = `[data-surface='normal']`
  css +=
    `${sel} ${dsl} {\n${toDecls(solidSurfaceVars(rGrey, LIGHT, +1))}\n}\n` +
    `html[data-theme='dark'] ${sel} ${dsl},\n` +
    `html[data-theme='dark']${sel} ${dsl} {\n${toDecls(solidSurfaceVars(rGrey, DARK, -1))}\n}\n`

  return css
}
