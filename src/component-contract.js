/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  CONTRACT — one component set, said once.

  A capture is per variant, which is the only shape a walk of the document can
  produce and the wrong shape to read or to diff. Measured on the real ODS
  Avatar: 18 variants, 69 distinct (layer, property) facts, and 40 of them
  identical in all 18. Written out per variant that is some 540 lines of which
  500 are the same line again.

  So every fact is asked one question — WHAT DOES IT DEPEND ON — and answered
  with the smallest set of axes that predicts it. Constant facts lose their
  key entirely; a width that follows Size alone is keyed by Size alone, though
  the component also has a Variant and a Badge Type axis. The reader gets the
  shape of the component rather than a transcript of it, and a diff of two
  contracts shows the decision that moved rather than the eighteen rows that
  followed it.

  NOTHING IS INFERRED. A fact is constant when every variant holding that layer
  agrees, and keyed by an axis subset when the values are a function of it —
  both are arithmetic over what the capture saw. Where no smaller subset works
  the full combination is used, which is the per-variant form and always true.
*/

/*
  THE SUB-PROPERTIES A TEXT STYLE GOVERNS.

  RADD typography is authored as text styles, and a style bundles these seven.
  Measured on ODS Avatar: the Digits layer binds eight variables, seven of them
  typography/body-M-bold/* — one decision, written seven times, in every one of
  the eighteen variants. The style is the fact; these are its parts, and a
  contract that lists them has buried the thing it was trying to say.

  They are dropped ONLY when the layer actually carries a style. A layer that
  binds them with no style has no shorter way to be described, and the seven
  lines are then the truth.
*/
var TEXT_STYLE_PARTS = {
  fontSize: 1, fontFamily: 1, fontWeight: 1, lineHeight: 1,
  letterSpacing: 1, paragraphSpacing: 1, paragraphIndent: 1,
};

var CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
var PADS = { paddingTop: 'top', paddingRight: 'right', paddingBottom: 'bottom', paddingLeft: 'left' };

/*
  WHAT ONE LAYER SAYS, IN ONE VARIANT.

  A token where there is one, the literal where there is not. Both are facts
  about the component and only one of them can be the answer: a bound width and
  its resolved 48 are the same decision seen from two sides, and printing both
  would double every line to say one thing. The token wins because it is the
  one that survives someone changing the scale.

  A literal is a number and a token is a string, so "is this tokenised" is a
  typeof rather than a convention nobody remembers.
*/
function layerFacts(layer) {
  var out = {};
  var b = layer.bindings || {};
  var styled = !!layer.textStyle;

  Object.keys(b).forEach(function (key) {
    if (styled && TEXT_STYLE_PARTS[key]) return;         // the style already said it
    if (CORNERS.indexOf(key) !== -1 || PADS[key]) return; // folded below
    out[key] = b[key];
  });

  /* Four corners agreeing is one radius. Four corners disagreeing is four
     facts, and a component that rounds three corners means it. */
  var corners = CORNERS.map(function (k) { return b[k]; });
  if (corners.every(function (c) { return c && c === corners[0]; })) {
    out.radius = corners[0];
  } else {
    CORNERS.forEach(function (k, i) { if (corners[i]) out[k] = corners[i]; });
    if (typeof layer.radius === 'number' && !corners.some(Boolean)) out.radius = layer.radius;
  }

  /* Padding: the bound side wins, the literal fills the rest. A component with
     one bound side and three zeros is describing exactly that. */
  if (layer.layout) {
    var pad = layer.layout.padding || [];
    Object.keys(PADS).forEach(function (key) {
      var side = PADS[key];
      var at = ['top', 'right', 'bottom', 'left'].indexOf(side);
      var v = b[key] !== undefined ? b[key] : pad[at];
      if (v !== undefined && v !== null) out['padding.' + side] = v;
    });
    out['layout.mode'] = layer.layout.mode;
    if (b.itemSpacing !== undefined) out.gap = b.itemSpacing;
    else if (layer.layout.gap !== null && layer.layout.gap !== undefined) out.gap = layer.layout.gap;
    out['align.primary'] = layer.layout.primary;
    out['align.counter'] = layer.layout.counter;
  } else {
    Object.keys(PADS).forEach(function (key) { if (b[key] !== undefined) out['padding.' + PADS[key]] = b[key]; });
  }

  if (layer.sizing) {
    if (layer.sizing[0]) out['sizing.h'] = layer.sizing[0];
    if (layer.sizing[1]) out['sizing.v'] = layer.sizing[1];
  }
  if (layer.alignSelf) out.alignSelf = layer.alignSelf;
  if (layer.textAlign) out.textAlign = layer.textAlign;
  if (layer.textStyle) out.textStyle = layer.textStyle.name;

  /*
    The resolved geometry, kept only where nothing is bound — otherwise it is
    the token's own value wearing a second hat — AND ONLY WHERE THE AXIS IS
    FIXED, because anywhere else the number is a consequence rather than a
    decision.

    Measured on ODS Avatar: the Digits layer is FILL/HUG, so its width is 14
    when it renders "1" and 8 when it renders a narrower glyph. That is the
    text, not the component, and a contract carrying it would report a change
    every time somebody edited the placeholder.
  */
  var sizing = layer.sizing || [];
  if (layer.size) {
    if (b.width === undefined && sizing[0] === 'FIXED' && typeof layer.size[0] === 'number') out.width = layer.size[0];
    if (b.height === undefined && sizing[1] === 'FIXED' && typeof layer.size[1] === 'number') out.height = layer.size[1];
  }
  return out;
}

/*
  THE SMALLEST SET OF AXES THAT PREDICTS A VALUE.

  Subsets are tried smallest first, and the first that works wins — so a width
  that follows Size is keyed by Size, not by the Size/Variant pair that also
  happens to predict it. The reader is told what the value depends on, and a
  larger key would be true and misleading.

  "Works" is one condition: every group of variants agreeing on the subset
  agrees on the value. The full axis list always satisfies it, because the
  props ARE the variant — so this terminates on the per-variant form rather
  than on a failure, and a fact that genuinely depends on everything says so.
*/
function combinations(list, size) {
  if (size === 0) return [[]];
  var out = [];
  for (var i = 0; i <= list.length - size; i++) {
    combinations(list.slice(i + 1), size - 1).forEach(function (rest) {
      out.push([list[i]].concat(rest));
    });
  }
  return out;
}

function keyFor(props, axes) {
  return axes.map(function (a) { return a + '=' + props[a]; }).join(', ');
}

function smallestKey(rows, axes) {
  for (var size = 1; size <= axes.length; size++) {
    var sets = combinations(axes, size);
    for (var s = 0; s < sets.length; s++) {
      var seen = Object.create(null);
      var ok = true;
      for (var i = 0; i < rows.length; i++) {
        var k = keyFor(rows[i].props, sets[s]);
        if (seen[k] === undefined) seen[k] = rows[i].value;
        else if (seen[k] !== rows[i].value) { ok = false; break; }
      }
      if (ok) return sets[s];
    }
  }
  return axes;
}

/*
  A FACT, COLLAPSED. One value when every variant holding the layer agrees, and
  otherwise a map keyed by the axes it actually follows.

  AND A THIRD FORM, FOR THE ODD ONE OUT. Measured on the real ODS Avatar: the
  root's horizontal sizing is FIXED in seventeen variants and HUG in one, so no
  axis predicts it and the smallest key is every axis — eighteen lines to say
  "FIXED, except once". The exception form says that instead, and it is not
  merely shorter: a lone variant disagreeing with its seventeen siblings is
  almost always a slip, and a contract that buries it in a full map has hidden
  the most interesting thing on the layer.

  `*` is the rule and the rest are the exceptions, listed by the combination
  that identifies them. Chosen only when it is strictly shorter, so a fact that
  genuinely follows an axis keeps the form that names the axis.
*/
function collapse(rows, axes) {
  var first = rows[0].value;
  if (rows.every(function (r) { return r.value === first; })) return first;

  var key = smallestKey(rows, axes);
  var byKey = {};
  rows.forEach(function (r) { byKey[keyFor(r.props, key)] = r.value; });

  /* The most common value, and what disagrees with it. */
  var tally = new Map();
  rows.forEach(function (r) { tally.set(r.value, (tally.get(r.value) || 0) + 1); });
  var best = null, bestN = 0;
  tally.forEach(function (n, v) { if (n > bestN) { bestN = n; best = v; } });
  var odd = rows.filter(function (r) { return r.value !== best; });

  if (odd.length + 1 < Object.keys(byKey).length) {
    var out = { '*': best };
    odd.forEach(function (r) { out[keyFor(r.props, axes)] = r.value; });
    return out;
  }
  return byKey;
}

/*
  WHEN A LAYER IS THERE AT ALL.

  Measured on ODS Avatar: Image exists only when Variant=Avatar, User only when
  Icon, Initials only when Initials. A layer present everywhere says nothing
  about it; one that is not gets the same treatment as a value — the smallest
  axis subset that predicts its presence, as a list of the keys it appears
  under.
*/
function presence(seen, allProps, axes) {
  /* Seen in EVERY variant, not merely one entry per variant — `seen` is a flag
     array the same length as the variant list by construction, so comparing
     lengths asks nothing and answers null every time. */
  if (seen.every(Boolean)) return null;
  var rows = allProps.map(function (props, i) {
    return { props: props, value: seen[i] ? 'yes' : 'no' };
  });
  var key = smallestKey(rows, axes);
  var yes = [];
  rows.forEach(function (r) {
    if (r.value !== 'yes') return;
    var k = keyFor(r.props, key);
    if (yes.indexOf(k) === -1) yes.push(k);
  });
  return yes.join(' | ');
}

/*
  contract(capture) -> { component, figma, api, composes, layers, summary }
*/
function contract(capture, opts) {
  opts = opts || {};
  /*
    SORTED, AND THE ORDER MATTERS MORE THAN IT LOOKS.

    Every collapsed key is these names joined — "Size=Large, Variant=Avatar" —
    so the axis order IS the text of every key in the file. Figma reports the
    properties in the order they were defined, and rearranging variants in a
    set can change it. Taken as given, somebody reordering a component set
    would produce a contract diff in which every line moved and nothing
    changed.
  */
  var axes = (capture.api || [])
    .filter(function (p) { return p.type === 'VARIANT'; })
    .map(function (p) { return p.name; })
    .sort();

  var variants = capture.variants || [];
  var allProps = variants.map(function (v) { return v.props || {}; });

  /* layer path -> { type, instanceOf, inInstance, seenIn[], facts: { name -> rows[] } } */
  var byLayer = new Map();
  variants.forEach(function (v, vi) {
    (v.layers || []).forEach(function (layer) {
      if (!byLayer.has(layer.path)) {
        byLayer.set(layer.path, { type: layer.type, instanceOf: layer.instanceOf || null,
                                  inInstance: layer.inInstance || null,
                                  seen: new Array(variants.length).fill(false),
                                  hiddenIn: 0, facts: new Map() });
      }
      var slot = byLayer.get(layer.path);
      slot.seen[vi] = true;
      if (layer.hidden) slot.hiddenIn++;
      var facts = layerFacts(layer);
      Object.keys(facts).forEach(function (name) {
        if (!slot.facts.has(name)) slot.facts.set(name, []);
        slot.facts.get(name).push({ props: v.props || {}, value: facts[name] });
      });
    });
  });

  var composes = [];
  var layers = {};
  var stats = { facts: 0, constant: 0, varying: 0, unbound: 0 };

  byLayer.forEach(function (slot, path) {
    var out = {};
    if (slot.instanceOf) {
      out.instanceOf = slot.instanceOf;
      if (composes.indexOf(slot.instanceOf) === -1) composes.push(slot.instanceOf);
    }
    var when = presence(slot.seen, allProps, axes);
    if (when) out.when = when;
    /* Hidden in every variant it appears in: Figma leaves it out of layout, so
       its sizing readings are not to be believed and the contract says why
       rather than carrying numbers it does not trust. */
    if (slot.hiddenIn === slot.seen.filter(Boolean).length) out.hidden = true;

    slot.facts.forEach(function (rows, name) {
      var value = collapse(rows, axes);
      out[name] = value;
      stats.facts++;
      if (typeof value === 'object') stats.varying++; else stats.constant++;
      var sample = typeof value === 'object' ? Object.keys(value).map(function (k) { return value[k]; }) : [value];
      if (sample.some(function (x) { return typeof x === 'number'; })) stats.unbound++;
    });
    layers[path] = out;
  });

  var out = {
    component: capture.name,
    /*
      THE OTHER HALF OF THE LOCK. The Figma side remembers which file its
      contract is; this is the file remembering which component it came from,
      so a comparison can tell that it has been pointed at the wrong one. The
      published key outlives the node id — a component copied to another file
      keeps the key and gets a new id — so both travel and whichever survives
      answers.
    */
    figma: { fileKey: capture.fileKey || null, nodeId: capture.nodeId,
             key: capture.key || null },
    api: (capture.api || []).reduce(function (acc, p) {
      var e = { type: String(p.type).toLowerCase().replace('_', '-') };
      if (p.values) e.values = p.values;
      if (p.default !== undefined) e['default'] = p.default;
      acc[p.name] = e;
      return acc;
    }, {}),
    layers: layers,
  };
  if (capture.description) out.description = capture.description;
  if (composes.length) out.composes = composes.sort();
  if (capture.truncated) out.truncated = capture.truncated;
  if (opts.summary !== false) {
    out.summary = { variants: variants.length, layers: byLayer.size,
                    facts: stats.facts, constant: stats.constant,
                    varying: stats.varying, unbound: stats.unbound };
  }
  return out;
}

  var api = { TEXT_STYLE_PARTS, layerFacts, combinations, smallestKey, collapse, presence, contract };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomComponentContract = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
