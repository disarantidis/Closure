/** every kind a NodeCard can be, as a VALUE — so the type and anything that
    enumerates it (nodeIcons' NODE_ICON/KIND_LABEL, node-kit-test.mjs) read off
    the same list, and a new kind cannot land in one without the other. */
export const NODE_KINDS = [
  'image', 'text', 'mixed', 'mechanism', 'colour', 'coreRamp',
  'facet', 'source', 'propsMaster', 'doc', 'facetConfig', 'styleGroup',
] as const
export type NodeKind = (typeof NODE_KINDS)[number]
