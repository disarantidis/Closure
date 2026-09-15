// detectBrandColor — one uploaded image or SVG → the brand's seed colour.
//
// The front end to the re-scheming. `generateScheme` turns a hex into a whole
// scheme; this turns a logo into that hex, so a visitor can drop their mark in and
// the app colours itself. Feed the result straight to `generateSchemeCss`:
//
//     const found = await detectBrandColor(file)
//     if (found) inject(generateSchemeCss(found.hex))
//
// THE BRAND COLOUR is the most SATURATED, reasonably BRIGHT hue in the artwork — the
// ink a logo is known by, not its black outlines, grey rules or white ground. Two
// pure cores do the work (a raster histogram, an SVG colour scan); a thin browser
// entry decodes a File into one of them. The cores have zero dependencies and no DOM,
// so they are the testable surface; only the entry touches canvas/File.
//
// It reads locally and returns a hex — nothing is uploaded, matching the re-scheming's
// own "no model sees the file" promise.

export type Detected = {
  /** the seed hex to hand to `generateSchemeCss` */
  hex: string
  /** the seed's HSL, for a dashboard to show what it read */
  hsl: { h: number; s: number; l: number }
  /** the runners-up (distinct saturated colours), so a UI can offer a pick */
  candidates: string[]
} | null

// ── colour maths (self-contained, like generateScheme's) ────────────────────
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number]
}
function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}
function normHex(hex: string): string {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return '#' + f.toUpperCase()
}
/** HSL: hue 0–360, saturation & lightness 0–1. */
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s, l }
}

// ── the "brandness" score ───────────────────────────────────────────────────
// Reward saturation (squared, so vivid beats muddy); reward a mid-bright lightness
// (a real colour, not a near-black shade or a washed-out tint); and zero out the
// three things a logo is NOT branded by — near-grey, near-white, near-black.
const S_FLOOR = 0.16, L_LO = 0.1, L_HI = 0.93, L_PEAK = 0.55
function brandness(s: number, l: number): number {
  if (s < S_FLOOR || l < L_LO || l > L_HI) return 0
  const lightWeight = 1 - Math.min(1, Math.abs(l - L_PEAK) / (1 - L_PEAK))
  return s * s * lightWeight
}

// ── 1. raster: RGBA pixels → seed ───────────────────────────────────────────
// Histogram the qualifying pixels into 36 hue buckets, weighted by brandness, and
// keep the best exemplar per bucket. The winning bucket is the hue the artwork is
// most vividly made of; its best exemplar is the seed. A histogram, not a single
// max-pixel, so one stray vivid speck can't hijack the brand.
const BUCKETS = 36
export function brandColorFromPixels(rgba: Uint8ClampedArray | number[]): Detected {
  const weight = new Array(BUCKETS).fill(0)
  const best: ({ score: number; rgb: [number, number, number]; h: number; s: number; l: number } | null)[] =
    new Array(BUCKETS).fill(null)
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) continue // effectively transparent
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const { h, s, l } = rgbToHsl(r, g, b)
    const w = brandness(s, l)
    if (!w) continue
    const bkt = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS))
    weight[bkt] += w
    const cur = best[bkt]
    if (!cur || w > cur.score) best[bkt] = { score: w, rgb: [r, g, b], h, s, l }
  }
  return pick(weight, best)
}

function pick(
  weight: number[],
  best: ({ score: number; rgb: [number, number, number]; h: number; s: number; l: number } | null)[]
): Detected {
  const order = weight
    .map((w, i) => [w, i] as [number, number])
    .filter(([w]) => w > 0)
    .sort((a, b) => b[0] - a[0])
  if (!order.length) return null
  const ex = best[order[0][1]]!
  return {
    hex: rgbToHex(ex.rgb),
    hsl: { h: Math.round(ex.h), s: +ex.s.toFixed(3), l: +ex.l.toFixed(3) },
    candidates: order.slice(0, 5).map(([, i]) => rgbToHex(best[i]!.rgb)),
  }
}

// ── 2. SVG: declared colours → seed ─────────────────────────────────────────
// A vector mark states its colours; we don't rasterise it. Pull every colour token
// out of the markup, score each by brandness, and pick the most saturated one, broken
// by how often it is declared — a logo repeats its brand fill across paths.
const NAMED: Record<string, string> = {
  red: '#FF0000', orangered: '#FF4500', orange: '#FFA500', gold: '#FFD700', yellow: '#FFFF00',
  lime: '#00FF00', green: '#008000', teal: '#008080', cyan: '#00FFFF', aqua: '#00FFFF',
  dodgerblue: '#1E90FF', blue: '#0000FF', indigo: '#4B0082', purple: '#800080', magenta: '#FF00FF',
  fuchsia: '#FF00FF', violet: '#EE82EE', pink: '#FFC0CB', hotpink: '#FF69B4', crimson: '#DC143C',
  tomato: '#FF6347', coral: '#FF7F50', salmon: '#FA8072', deeppink: '#FF1493', royalblue: '#4169E1',
}
function extractColors(svg: string): string[] {
  const out: string[] = []
  for (const m of svg.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) out.push(normHex('#' + m[1]))
  for (const m of svg.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) out.push(rgbToHex([+m[1], +m[2], +m[3]]))
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color|flood-color|[^-]color)\s*[=:]\s*["']?\s*([a-zA-Z]+)/g)) {
    const n = m[1].toLowerCase()
    if (NAMED[n]) out.push(NAMED[n])
  }
  return out
}
export function brandColorFromSvg(svg: string): Detected {
  const seen = new Map<string, { count: number; h: number; s: number; l: number; w: number }>()
  for (const hex of extractColors(svg)) {
    const [r, g, b] = hexToRgb(hex)
    const { h, s, l } = rgbToHsl(r, g, b)
    const w = brandness(s, l)
    if (!w) continue
    const rec = seen.get(hex) || { count: 0, h, s, l, w }
    rec.count++
    seen.set(hex, rec)
  }
  if (!seen.size) return null
  const ranked = [...seen.entries()].sort((a, b) => b[1].count * b[1].w - a[1].count * a[1].w)
  const [hex, win] = ranked[0]
  return {
    hex,
    hsl: { h: Math.round(win.h), s: +win.s.toFixed(3), l: +win.l.toFixed(3) },
    candidates: ranked.slice(0, 5).map(([h]) => h),
  }
}

// ── 3. the browser entry — a File → seed ────────────────────────────────────
// The only DOM in the module. SVG is read as text (pure path); a raster is decoded,
// downscaled to 96px on its long edge (speed, and it averages away JPEG noise), and
// its pixels handed to the histogram.
export async function detectBrandColor(file: Blob & { name?: string }): Promise<Detected> {
  const isSvg = (file.type || '').includes('svg') || /\.svg$/i.test(file.name || '')
  if (isSvg) return brandColorFromSvg(await file.text())

  const bmp = await createImageBitmap(file)
  const MAX = 96
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  bmp.close?.()
  return brandColorFromPixels(data)
}
