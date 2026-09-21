/*
  What each kind of node LOOKS like — one table, and the only place that decides.

  The board's first design language said a node's kind with a coloured crown. A
  crown is a good signal and a poor label: it distinguishes six families, and the
  canvas has twelve kinds. So the icon carries the category and the colour keeps
  saying what CLASS of thing it is — authored, decided, generated, run — which is
  the split the reference board uses too: every card there is white, and you know
  a schedule from a request from a branch by its glyph.

  Drawings come from Tabler, compiled into src/panel/node/icons.generated.ts
  by scripts/build-icons.mjs. The names below are OURS and semantic — `facet`,
  not `cube` — so a better glyph can be chosen for a kind by editing the
  generator's one mapping table, and nothing here changes. `IconName` is a union,
  so a name that no longer exists is a type error rather than a blank square, and
  scripts/node-kit-test.mjs asserts this table covers every kind in NODE_KINDS.
*/
import { icon, type IconCmp } from './Icon'
import type { NodeKind } from './nodeKinds'

export type { IconCmp }

/** kind → its glyph. Every kind, or the suite fails. */
export const NODE_ICON: Record<NodeKind, IconCmp> = {
  facet: icon('facet'), // a component: a piece that fits with other pieces
  facetConfig: icon('facetConfig'), // its properties, broken out — things you set
  colour: icon('colour'),
  coreRamp: icon('coreRamp'), // a whole ramp, not one colour
  propsMaster: icon('propsMaster'), // the master every property descends from
  styleGroup: icon('styleGroup'), // components bound to move together
  source: icon('source'), // generated code
  doc: icon('doc'), // knowledge
  mechanism: icon('mechanism'), // a station you run
  image: icon('image'),
  text: icon('text'),
  mixed: icon('mixed'),
}

/** the generative stations read differently from the deterministic ones */
export const GENERATIVE_ICON: IconCmp = icon('generative')
export const FALLBACK_ICON: IconCmp = icon('fallback')

export function iconFor(kind: NodeKind | string, generative = false): IconCmp {
  if (generative) return GENERATIVE_ICON
  return NODE_ICON[kind as NodeKind] ?? FALLBACK_ICON
}

/** the human name of a kind, for headers and pickers */
export const KIND_LABEL: Record<NodeKind, string> = {
  facet: 'Component',
  facetConfig: 'Properties',
  colour: 'Colour',
  coreRamp: 'Core ramp',
  propsMaster: 'Property master',
  styleGroup: 'Style group',
  source: 'Generated file',
  doc: 'Knowledge',
  mechanism: 'Station',
  image: 'Image',
  text: 'Note',
  mixed: 'Mixed',
}
