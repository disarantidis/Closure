/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  CAPTURE — read a component set, and decide nothing.

  This is the only module that touches a Figma node, and like import-apply it is
  deliberately the dumb end of the pipeline: it walks the set and writes down
  what it saw. Every judgement — which facts are constant, which vary and by
  which axis, which seven bindings are really one text style — belongs to
  contract(), which works on this output and can therefore be tested without a
  document open.

  Splitting it the other way round is the mistake that makes it unmaintainable:
  the collapse would only ever be exercisable through a live file, which means
  in practice it would not be exercised.

  IT TAKES `figma` AS AN ARGUMENT rather than reaching for the global, so the
  suite can drive it with a stand-in and the bridge can run the shipping code
  against a real file.

  WHAT A LAYER IS. Every node under a variant, addressed by its path from the
  variant root — `ODS Badge Number/Digits`, not `Digits`, because two layers in
  one component are allowed to share a name and a contract keyed by a colliding
  name silently merges two different things.

  NESTED INSTANCES ARE KEPT, and this is where this file parts company with the
  OBD extractor it learned from. OBD filters foreign instances out because it is
  diffing this component against this component's CSS, and a nested component's
  bindings are the nested component's business. A CONTRACT is a different claim:
  measured on ODS Avatar, the nested badge's minWidth, maxWidth and minHeight
  all track Avatar's own Size axis. That is a fact about Avatar. So the instance
  is captured, tagged with what it is an instance OF, and its subtree is
  captured with it — what the contract does with that is contract()'s business.

  WHAT IS SKIPPED is a layer with nothing to say: no bindings, no auto-layout,
  not text, no align-self of its own, and not an instance. A component set of
  any size is mostly those, and carrying them would bury the ones that matter.
*/

var DEFAULTS = {
  maxVariants: 200,
  maxNodesPerVariant: 400,
};

/* The first two segments of a boundVariables entry: fills and strokes arrive as
   arrays (one entry per paint), everything else as a single object. Only the
   first is taken — a layer with two bound paints is telling us about the paint
   stack, which is a different feature from this one. */
function firstEntry(raw) {
  return Array.isArray(raw) ? raw[0] : raw;
}

/* A node's path from the variant root, names joined. The root itself is `root`,
   which is the name a contract can talk about without knowing what the variant
   happened to be called. */
function pathFrom(node, root) {
  if (node === root || node.id === root.id) return 'root';
  var parts = [];
  var cur = node;
  while (cur && cur.id !== root.id) {
    parts.unshift(cur.name);
    cur = cur.parent;
  }
  return parts.join('/');
}

/* The outermost INSTANCE between this node and the variant root — what a nested
   layer belongs to. Null when the node is the component's own. */
function outermostInstance(node, root) {
  var found = null;
  var cur = node;
  while (cur && cur.id !== root.id) {
    if (cur.type === 'INSTANCE') found = cur;
    cur = cur.parent;
  }
  return found;
}

/* Hidden here, or under something hidden. Figma leaves a hidden node out of the
   layout pass, so its layoutSizing readings are not to be believed — the flag
   travels so contract() can decline to compare them. */
function hiddenWithin(node, root) {
  var cur = node;
  while (cur && cur.id !== root.id) {
    if (cur.visible === false) return true;
    cur = cur.parent;
  }
  return node.visible === false;
}

function isAutoLayout(node) {
  return typeof node.layoutMode === 'string' && node.layoutMode !== 'NONE';
}

/* A number, or null when Figma says "mixed" — a corner radius that differs per
   corner is four facts, and this is the field for the one-fact case. */
function uniformNumber(v) {
  return typeof v === 'number' ? v : null;
}

/*
  WHAT ONE LAYER IS WORTH WRITING DOWN.

  The bindings first, because they are the point: a token is what a contract is
  mostly made of. Then the facts a binding cannot carry — alignment and sizing
  are not variables, so a layer can matter with no bindings at all — and then
  the literal geometry, which is the answer when nothing is bound. `unbound` is
  not a failure here: a component with a hard-coded 8px gap has a contract that
  says so, and saying so is how it gets fixed.
*/
async function captureLayer(node, root, resolveVar, resolveStyle) {
  var bindings = {};
  var bv = node.boundVariables || {};
  var keys = Object.keys(bv);
  for (var i = 0; i < keys.length; i++) {
    var name = await resolveVar(firstEntry(bv[keys[i]]));
    if (name) bindings[keys[i]] = name;
  }

  var auto = isAutoLayout(node);
  var isText = node.type === 'TEXT';
  var isInstance = node.type === 'INSTANCE';
  var alignSelf = typeof node.layoutAlign === 'string' && node.layoutAlign !== 'INHERIT'
    ? node.layoutAlign : null;

  /* Nothing to say. Most of a component set is this. */
  if (!Object.keys(bindings).length && !auto && !isText && !isInstance && !alignSelf
      && node.id !== root.id) {
    return null;
  }

  var layer = {
    path: pathFrom(node, root),
    type: node.type,
    bindings: bindings,
  };

  var inside = outermostInstance(node, root);
  if (isInstance) {
    var main = null;
    try { main = await node.getMainComponentAsync(); } catch (e) { main = null; }
    /* The component it is an instance of, by the name a person would recognise:
       a variant's main component is a COMPONENT inside a set, and the set is
       what the library published. */
    var owner = main && main.parent && main.parent.type === 'COMPONENT_SET'
      ? main.parent : main;
    layer.instanceOf = owner ? owner.name : null;
  }
  if (inside && inside.id !== node.id) layer.inInstance = inside.name;
  if (hiddenWithin(node, root)) layer.hidden = true;
  if (alignSelf) layer.alignSelf = alignSelf;

  if (auto) {
    layer.layout = {
      mode: node.layoutMode,
      gap: uniformNumber(node.itemSpacing),
      padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      primary: node.primaryAxisAlignItems,
      counter: node.counterAxisAlignItems,
    };
  }
  if (node.layoutSizingHorizontal || node.layoutSizingVertical) {
    layer.sizing = [node.layoutSizingHorizontal || null, node.layoutSizingVertical || null];
  }
  if (isText) {
    layer.textAlign = node.textAlignHorizontal;
    var style = await resolveStyle(node.textStyleId);
    if (style) layer.textStyle = style;
  }

  /* The literal, for the properties a contract is about. Kept whatever the
     bindings say, because a bound width and its resolved 48 are two different
     facts and only one of them survives a token being renamed. */
  layer.size = [uniformNumber(node.width), uniformNumber(node.height)];
  var radius = uniformNumber(node.cornerRadius);
  if (radius !== null) layer.radius = radius;

  return layer;
}

/*
  CAPTURE ONE COMPONENT SET.

  `resolveVar` and `resolveStyle` are passed in rather than reached for, and
  both are cached across the whole set: a component of eighteen variants asks
  about the same forty variables eighteen times, and each one is a round trip
  into Figma's async API.
*/
async function captureComponentSet(set, figma, opts) {
  opts = opts || {};
  var limits = {
    maxVariants: opts.maxVariants || DEFAULTS.maxVariants,
    maxNodesPerVariant: opts.maxNodesPerVariant || DEFAULTS.maxNodesPerVariant,
  };

  var varCache = new Map();
  var resolveVar = async function (entry) {
    if (!entry || !entry.id) return null;
    if (varCache.has(entry.id)) return varCache.get(entry.id);
    var name = null;
    try {
      var v = await figma.variables.getVariableByIdAsync(entry.id);
      name = v ? v.name : null;
    } catch (e) { name = null; }
    varCache.set(entry.id, name);
    return name;
  };
  var styleCache = new Map();
  var resolveStyle = async function (id) {
    if (!id || typeof id !== 'string') return null;       // mixed ranges → not one style
    if (styleCache.has(id)) return styleCache.get(id);
    var out = null;
    try {
      var s = await figma.getStyleByIdAsync(id);
      out = s ? { id: id, name: s.name } : null;
    } catch (e) { out = null; }
    styleCache.set(id, out);
    return out;
  };

  var defs = set.componentPropertyDefinitions || {};
  var api = Object.keys(defs).map(function (key) {
    var d = defs[key];
    /* Figma suffixes non-variant property keys with "#nodeId" to keep them
       unique in its own store. That id is this file's, not the contract's — it
       changes when the property is re-created and would read as a rename. */
    var entry = { name: key.split('#')[0], type: d.type };
    if (d.variantOptions) entry.values = d.variantOptions.slice();
    if (d.defaultValue !== undefined) entry.default = d.defaultValue;
    return entry;
  });

  var variantNodes = set.children.filter(function (c) { return c.type === 'COMPONENT'; });
  var truncated = {};
  if (variantNodes.length > limits.maxVariants) {
    truncated.variants = variantNodes.length;
    variantNodes = variantNodes.slice(0, limits.maxVariants);
  }

  var variants = [];
  for (var i = 0; i < variantNodes.length; i++) {
    var root = variantNodes[i];
    var all = root.findAll(function () { return true; });
    if (all.length > limits.maxNodesPerVariant) {
      truncated.nodes = Math.max(truncated.nodes || 0, all.length);
      all = all.slice(0, limits.maxNodesPerVariant);
    }
    var layers = [];
    var nodes = [root].concat(all);
    for (var j = 0; j < nodes.length; j++) {
      var layer = await captureLayer(nodes[j], root, resolveVar, resolveStyle);
      if (layer) layers.push(layer);
    }
    variants.push({ props: root.variantProperties || {}, layers: layers });
  }

  var out = {
    name: set.name,
    nodeId: set.id,
    description: set.description || '',
    api: api,
    variants: variants,
  };
  if (figma.fileKey) out.fileKey = figma.fileKey;
  if (Object.keys(truncated).length) out.truncated = truncated;
  return out;
}

  var api = { DEFAULTS, firstEntry, pathFrom, outermostInstance, hiddenWithin,
              captureLayer, captureComponentSet };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomComponentCapture = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
