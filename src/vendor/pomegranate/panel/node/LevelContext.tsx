/*
  LevelContext — the one fact a field cannot know about itself: which rung it is standing on.

  WHY IT HAD TO EXIST. A field is painted one rung ABOVE its ground: on a level-2 card the
  input is rung 3, on a level-3 card it is rung 4. The stylesheet used to do that with a
  lookup table — `[data-level='2'] { --nd-field-fill: var(--container-3) }`, four blocks,
  one per ground — and that worked only because every rung had an absolute name.

  With the rung collapse there is one fill name, `--background`, and it means "the fill of
  the level I am on". CSS cannot add: an element has no way to ask for one rung above its
  parent, and no variable holds that value any more. The step is a DOM fact now, so the DOM
  is where it is computed — the provider publishes its level, the field reads it and writes
  `data-level={one above}` on itself, and then paints the same `--background` everything
  else paints.

  IT IS ITS OWN FILE for the reason ChipGroupContext is: `Card` provides it and `TextField`
  reads it, so a home inside either one makes the pair import each other in a circle.

  THE GROUND'S COLOUR TRAVELS IN CSS, NOT HERE. Two of the field's values are mixes toward
  the ground it sits on (`--nd-readonly-field-fill` settles 25% into it; the disabled fill
  60%). A child that has already stepped its own `data-level` cannot read its parent's fill
  any more, so every provider captures it once — `--nd-ground: var(--background)`, resolved
  at the provider, where `--background` still IS the ground — and `:root` carries the same
  default for a bare document. See node.css, "THE GROUND, CAPTURED".
*/
import { createContext, useContext } from 'react'

/** the four rungs, as identities rather than ranks — see docs/knowledge-levels.md */
export type Level = 1 | 2 | 3 | 4

/*
  THE DEFAULT IS 2, and it is the same 2 the generator defaults to: `:root` publishes
  level 2's rungs, so a page that writes no `data-level` IS a level-2 island. A field
  rendered outside any card therefore steps to 3, which is exactly what it did before
  this context existed — the bare-document row of the table it replaces.
*/
export const LevelContext = createContext<Level>(2)

export const useLevel = (): Level => useContext(LevelContext)

/*
  ONE ABOVE, EXCEPT AT THE TOP, WHERE IT STEPS DOWN — and that clamp is inherited rather
  than invented. The table this replaces read L1→2, L2→3, L3→4 and L4→**3**: there is no
  rung 5, and a field flush with its card is a field you cannot see, so the top rung is the
  one place the step reverses. Reproduced exactly so no field moves in this migration.
*/
export const fieldLevel = (ground: Level): Level => (ground === 4 ? 3 : ((ground + 1) as Level))

/*
  ONE BELOW, EXCEPT AT THE FLOOR, WHERE IT STEPS UP — the mirror of `fieldLevel`, and the
  same inherited table: the skeleton's recess read `--surface-under` at L2–L4 (one rung
  down) and `--container-3` at L1, because there is nothing beneath the bottom rung. A
  groove uses it too, for its L2–L4 rungs; its own L1 case is not a rung at all but a nudge
  toward black, which the stylesheet carries as `.is-floor` (node.css, AND THE GROOVE IS THE
  SAME MECHANISM POINTED DOWN).
*/
export const recessLevel = (ground: Level): Level => (ground === 1 ? 3 : ((ground - 1) as Level))

/** a groove has no rung below the floor — the stylesheet answers that case, not the axis */
export const isFloor = (ground: Level): boolean => ground === 1

/*
  THE RUNG BESIDE — a surface that stands directly on another surface. It is `fieldLevel`'s
  ladder under a second name, and the name is the point: the ledger borrowed the table by
  hand as `NEIGHBOUR_LEVEL` (Panel.tsx, 32 sites) and then wrote the same rung as a bare
  `level={3}` nine more times, so one rung had two spellings and neither was the kit's.
  SECTION-RULES C.2 makes it a function exported once. Not "one up": at the top rung it
  steps down, because there is no rung 5 and a card flush with its card is a card you
  cannot see — the same clamp `fieldLevel` inherited.
*/
export const neighbourLevel = (ground: Level): Level => fieldLevel(ground)
