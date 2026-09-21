/*
  glassLight — the specular rim's angle, driven by the cursor instead of the
  static `--light-angle` token.

  ONE LISTENER, NOT ONE PER ELEMENT. The light source is the pointer's position
  in the VIEWPORT, not something relative to any one glass surface — that is
  what makes it read as one ambient source lighting every surface consistently,
  the way a single lamp in a room does, rather than each surface inventing its
  own. So there is exactly one `pointermove` listener, installed lazily on the
  first call and never duplicated, and a registry of every currently-mounted
  glass element it re-angles on each (rAF-throttled) move.

  A REF CALLBACK, NOT A HOOK. Nine call sites across four files (Node.tsx,
  Select.tsx, Input.tsx, Button.tsx) each want the same one-line addition —
  `ref={glassLightRef}` — and none of them wants to import React's hook rules
  into a presentational component just to register a DOM node. React calls a
  ref callback with the element on mount; this one adds it to the registry.

  UNMOUNT IS HANDLED LAZILY, ON PURPOSE. React calls a ref callback with `null`
  on unmount, but by then it cannot say WHICH element is gone — only that some
  instance of this same function reference no longer wants one. Tracking that
  precisely would mean a per-instance closure at every one of those nine call
  sites, which is exactly the boilerplate this file exists to avoid. Instead
  the tick loop below prunes any registered element that is no longer
  `.isConnected` — the registry cannot grow past the number of glass surfaces
  actually on screen, and a removed node is dropped on the very next pointer
  move rather than precisely at unmount. For a decorative highlight, that is
  not a difference anyone can see.

  THE ANGLE, IN THE SAME CONVENTION THE STATIC TOKEN USES. node.css's comment
  on the rim says it plainly — Figma's angle names where light COMES FROM, a
  CSS gradient names where it GOES — and the static `--light-angle` (315°)
  already speaks the FROM convention, flipped +180° at the point of use. This
  keeps that contract: the angle written here is the direction from an
  element's own centre TOWARD the cursor, in standard CSS gradient degrees (0°
  = up, 90° = right, clockwise), so swapping the dynamic value in for the
  static one needs no change anywhere else — same variable, same convention,
  same +180° flip already sitting in the CSS.

  REDUCED MOTION IS CHECKED HERE, NOT IN CSS. An inline style always outranks a
  stylesheet rule, so a media query could never override an angle this module
  had already written. The only place that can honestly stop the override is
  the code about to make it — `glassLightRef` no-ops entirely when the reader
  has asked for less motion, and the listener is never installed at all.
*/

const registry = new Set<HTMLElement>()

let installed = false
let rafId = 0
let lastX = 0
let lastY = 0

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** cursor (x, y) → element centre, as a CSS gradient angle: 0deg is up, clockwise */
function angleTo(x: number, y: number, el: HTMLElement): number {
  const r = el.getBoundingClientRect()
  const dx = x - (r.left + r.width / 2)
  const dy = y - (r.top + r.height / 2)
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (deg + 360) % 360
}

function tick() {
  rafId = 0
  for (const el of registry) {
    if (!el.isConnected) {
      registry.delete(el)
      continue
    }
    el.style.setProperty('--light-angle', `${angleTo(lastX, lastY, el).toFixed(1)}deg`)
  }
}

function onPointerMove(e: PointerEvent) {
  lastX = e.clientX
  lastY = e.clientY
  if (rafId) return
  rafId = requestAnimationFrame(tick)
}

function ensureListener() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('pointermove', onPointerMove, { passive: true })
}

/**
 * `ref={glassLightRef}` on any glass-bearing element — the rim (or, for
 * surfaces that only frost, a future rim) then tracks the cursor across the
 * whole viewport instead of holding the foundation's static 315°.
 *
 * A no-op under `prefers-reduced-motion: reduce`: the element is never
 * registered, `--light-angle` is never overridden, and the static token shows.
 */
export function glassLightRef(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return
  registry.add(el)
  ensureListener()
}
