/*
 * emit-resolved.js — shape a resolved Figma variable graph into a
 * consumption-oriented document, deriving the shape from the file.
 *
 * WHAT IT PRODUCES, and why it looks nothing like the export we already ship.
 * The default export mirrors the authoring structure: one document per
 * collection x mode, alias hops preserved as cross-document references. This
 * produces the other thing a consumer may want — the routing resolved away,
 * each token sitting under exactly the choices it actually varies with.
 *
 * NOTHING HERE IS NAMED. An earlier version of this file reached for
 * '.scheme', '.mode', '.breakpoint' and 'layout' by name, which worked on the
 * one design system it was written against and silently mis-emitted any other:
 * pointed at a file with two extra axes it pinned them to their defaults and
 * flattened a third of the colour surface to a single value per cell, with no
 * error. So every structural fact is now measured:
 *
 *   which collection holds raw values   the one aliasing nowhere (out-degree 0)
 *   which collections are consumed      the ones nothing aliases into (in-degree 0)
 *   what the axes are                   the multi-mode collections
 *   what order to nest them in          observed precedence, topologically sorted
 *   which axes a token varies with      resolve it and see what the walk entered
 *   which branches exist                the adaptive enumeration's real branches
 *   what a group's tokens are called    their longest common path prefix, removed
 *
 * The caller still supplies VOCABULARY — what to call a mode in the output,
 * which axes to hold at one value rather than branch over, and any token-type
 * hints a file's names carry that its metadata does not. Those are data about
 * one design system. The shape is not.
 *
 * RAGGED BY DESIGN. A branch records only the questions that were actually
 * asked. A scheme that never routes through the light/dark switch has no
 * light/dark segment in its path — it is one branch, not two identical ones.
 * That is the minimal lossless form; a house convention that wants it
 * rectangular can expand it, which is a presentation choice and belongs in
 * the caller, not here.
 *
 * REFERENCES, NOT INLINED VALUES. A token resolves by walking until it reaches
 * the primitive collection, then emits a reference to the token it landed on
 * ('{core.core-colours.base.white}') rather than that token's value. Only a
 * chain ending before the primitives contributes a literal. This keeps the
 * output traceable and is what a downstream consumer of this shape expects.
 *
 * HOOKS, because the pieces this needs already exist elsewhere and
 * reimplementing them would be a second source of truth. code.js owns the raw
 * value formatting and the composite builders; dtcg-format.js owns the DTCG
 * conversion. The caller passes them in — code.js has them in scope, and a
 * test supplies them the same way. This file only contributes the SHAPE.
 */
(function (global) {
  'use strict';

  var A = (typeof require === 'function')
    ? require('./resolve-architecture.js')
    : global.PomArchitecture;
  /* The RADD template, read only to say which architecture a graph is — see
     buildRestore. Absent in a build that does not carry it, which just means
     the section says nothing about it. */
  var AR = (typeof require === 'function')
    ? (function () { try { return require('./architecture-radd.js'); } catch (e) { return null; } })()
    : global.PomArchitectureRadd;

  /* The ODS template (src/architecture-ods.js), read at export time for the same reason. */
  var AO = (typeof require === 'function')
    ? (function () { try { return require('./architecture-ods.js'); } catch (e) { return null; } })()
    : global.PomArchitectureOds;

  /* The generic record of the whole graph (src/structure-graph.js), written into every Resolved export
     that asks for restore data, so a file of ANY layering can be rebuilt from its own JSON. */
  var SG = (typeof require === 'function')
    ? (function () { try { return require('./structure-graph.js'); } catch (e) { return null; } })()
    : global.PomStructureGraph;

  function dotted(name) { return name.split('/').join('.'); }

  /* Named defaults rather than function literals written inline after `||`:
     Figma Desktop for Mac compiles a function literal that is an operand of a
     logical or conditional expression wrongly. */
  function noTypeHint() { return null; }
  function keepModeName(axis, mode) { return mode; }
  function slugRename(axis, mode) { return slugModeName(mode); }

  function setDeep(root, path, value) {
    var parts = path.split('/');
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }

  /*
    A legacy token node. `description` is carried only when the variable has
    one: dtcg-format.js renames a truthy description to $description and skips
    it otherwise, so an undescribed token stays exactly as it was rather than
    gaining an empty field.
  */
  function tokenNode(value, type, description) {
    var node = { value: value, type: type };
    if (description) node.description = description;
    return node;
  }

  function lookupDotted(tree, path) {
    var parts = path.split('.');
    var node = tree;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  // --- token types ------------------------------------------------------------

  /*
    Figma's `scopes` says where a variable may be used — CORNER_RADIUS, GAP,
    FONT_SIZE — which is exactly the semantic distinction dtcg-format.js keys
    off, and unlike a name it is metadata rather than convention. Measured on a
    real file only ~3% of variables carry a narrowing scope, but they are
    almost entirely the consumption layer, which is the layer that matters:
    primitives get their type from whoever consumes them (see deriveTypes).
  */
  var SCOPE_TYPE = {
    CORNER_RADIUS: 'borderRadius',
    WIDTH_HEIGHT: 'sizing',
    GAP: 'spacing',
    STROKE_FLOAT: 'sizing',
    FONT_SIZE: 'fontSizes',
    LINE_HEIGHT: 'lineHeights',
    LETTER_SPACING: 'letterSpacing',
    FONT_WEIGHT: 'fontWeights',
    FONT_STYLE: 'fontWeights',
    FONT_FAMILY: 'fontFamilies',
    PARAGRAPH_SPACING: 'paragraphSpacing',
    PARAGRAPH_INDENT: 'paragraphIndent',
    OPACITY: 'opacity',
    EFFECT_FLOAT: 'dimension',
    EFFECT_COLOR: 'color',
    ALL_FILLS: 'color',
    FRAME_FILL: 'color',
    SHAPE_FILL: 'color',
    TEXT_FILL: 'color',
    STROKE_COLOR: 'color'
  };

  /*
    A SCOPE LIST NARROWS ONLY WHEN IT AGREES WITH ITSELF.

    Figma lets a variable be scoped to several properties at once, and a
    typography variable in a real file carries all seven text scopes —
    FONT_WEIGHT, FONT_SIZE, LINE_HEIGHT, LETTER_SPACING and the rest. That is
    not a narrowing; it is "usable anywhere in text", and it says nothing about
    what the variable IS.

    Taking the first match read that as FONT_WEIGHT, so every typography size
    became a font weight — and, because primitives inherit the type of what
    consumes them, so did all 22 core font sizes. They shipped as
    { "$type": "fontWeight", "$value": "14" }, which is also not conformant:
    DTCG's fontWeight takes a number or a keyword, never a string.

    So the scopes are read together. ALL_FILLS + STROKE_COLOR both mean colour
    and agree, so they still answer; the seven text scopes disagree, so they
    are silence and the next source decides.
  */
  /*
    Scopes that disagree by NAME can still agree on what the token is. GAP says
    spacing and WIDTH_HEIGHT says sizing, and a variable scoped to both is a
    length usable as either — DTCG calls both a dimension, so that is the
    answer rather than nothing. The seven text scopes do not agree even here:
    a font weight is not a length and a line height is a plain number.
  */
  var LENGTH_TYPES = {
    dimension: 1, spacing: 1, sizing: 1, borderRadius: 1,
    fontSizes: 1, letterSpacing: 1, paragraphSpacing: 1, paragraphIndent: 1
  };

  function typeFromScopes(v) {
    var scopes = v.scopes || [];
    var found = null;
    var allLengths = true;
    for (var i = 0; i < scopes.length; i++) {
      var t = SCOPE_TYPE[scopes[i]];
      if (!t) continue;                     // a scope this does not read, e.g. FONT_VARIATIONS
      if (!LENGTH_TYPES[t]) allLengths = false;
      if (found === null) found = t;
      else if (found !== t) found = '\u0000mixed';
    }
    if (found === null) return null;
    if (found !== '\u0000mixed') return found;
    return allLengths ? 'dimension' : null;
  }

  function typeFromResolved(resolvedType) {
    if (resolvedType === 'COLOR') return 'color';
    if (resolvedType === 'STRING') return 'text';
    return 'number';
  }

  /*
    A type for every variable, in descending order of authority:

      1  a caller hint — a deliberate statement about THIS file
      2  the variable's own narrowing scope — Figma metadata about itself
      3  what its consumers resolved to — a primitive reached only by tokens
         scoped CORNER_RADIUS is a radius, and the graph says so
      4  its Figma type

    Steps 2 and 3 are why the primitive collection does not need a name table:
    the consumption layer is where scopes are set, and the alias edges carry
    that downwards. Measured on a real file, scopes plus propagation alone
    reproduce 95% of a hand-written table's answers from 215 scoped variables
    out of 7,984.

    Hints outrank both on purpose. Step 3 is an INFERENCE — a primitive is
    typed by what happens to consume it — and a file can consume a plain
    number through an effect slot, which propagation would then call a
    dimension. When the caller has said otherwise about that path, the caller
    is right; inference only fills silence. Where consumers disagree among
    themselves the majority wins, ties by name so a rerun agrees with itself.
  */
  function deriveTypes(index, plans, options) {
    var hint = options.typeHints || noTypeHint;
    var byId = {};
    var votes = {};

    Object.keys(index.varsById).forEach(function (id) {
      var v = index.varsById[id];
      var t = hint(v.name, v.type, v) || typeFromScopes(v);
      if (t) byId[id] = t;
    });

    plans.forEach(function (plan) {
      var t = byId[plan.variable.id];
      if (!t) return;
      Object.keys(plan.branches).forEach(function (key) {
        var terminal = plan.branches[key].terminal;
        // stated beats inferred: never vote over a hint or a real scope
        if (!terminal || byId[terminal.id]) return;
        votes[terminal.id] = votes[terminal.id] || {};
        votes[terminal.id][t] = (votes[terminal.id][t] || 0) + 1;
      });
    });

    Object.keys(votes).forEach(function (id) {
      var tally = votes[id];
      var best = Object.keys(tally).sort(function (a, b) {
        return (tally[b] - tally[a]) || a.localeCompare(b);
      })[0];
      if (best) byId[id] = best;
    });

    /*
      A SCALE IS ONE KIND OF THING, INCLUDING THE STEPS NOBODY USES.

      Propagation can only type a primitive that something consumes, so a scale
      split into used and unused steps came out split by type too: 12 of
      core.shadows.* as dimension and 12 as bare number, dimension.base alone
      among twenty dimensions, viewport-tv alone among six viewports. The
      difference was never about the tokens — it was about which ones happened
      to be aliased.

      So a step with no answer takes its siblings'. Siblings are the tokens
      sharing a scale prefix and the same Figma type, and the type is only
      borrowed when the ones that DO have an answer agree; a mixed group is
      left alone rather than flattened towards whichever is commoner.
    */
    var groups = {};
    Object.keys(index.varsById).forEach(function (id) {
      var v = index.varsById[id];
      var name = v.name || '';
      var cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('-'));
      var key = (cut > 0 ? name.slice(0, cut) : name) + '\u0000' + v.type;
      (groups[key] = groups[key] || []).push(v);
    });
    Object.keys(groups).forEach(function (key) {
      var members = groups[key];
      if (members.length < 2) return;
      var seen = {};
      var missing = [];
      members.forEach(function (v) {
        if (byId[v.id]) seen[byId[v.id]] = true;
        else missing.push(v);
      });
      var kinds = Object.keys(seen);
      if (kinds.length !== 1 || !missing.length) return;
      missing.forEach(function (v) { byId[v.id] = kinds[0]; });
    });

    return function typeOf(v) {
      return byId[v.id] || typeFromResolved(v.type);
    };
  }

  // --- branch vectors ---------------------------------------------------------

  function vectorKey(vec, order) {
    return order.map(function (n) {
      return vec[n] === undefined ? '*' : n + '=' + vec[n];
    }).join(',');
  }

  function isSubsetOf(a, b) {
    var ka = Object.keys(a);
    if (ka.length >= Object.keys(b).length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (b[ka[i]] !== a[ka[i]]) return false;
    }
    return true;
  }

  /*
    One group's branches, from the vectors its tokens actually produced.

    A token that never enters the light/dark switch yields a vector without it;
    one that does yields the same vector plus a light/dark choice. The first is
    the second with a question unasked, so it is dropped — keeping it would
    emit the token twice, once under a path that is a prefix of the other.
    What survives is the set of maximal vectors: every distinct question-path
    the group's tokens between them actually walk.
  */
  function groupBranches(plans, order) {
    var seen = {};
    plans.forEach(function (plan) {
      Object.keys(plan.branches).forEach(function (key) {
        var b = plan.branches[key];
        var vec = {};
        (b.dependsOn || []).forEach(function (n) {
          if (b.vector[n] !== undefined) vec[n] = b.vector[n];
        });
        seen[vectorKey(vec, order)] = vec;
      });
    });

    var all = Object.keys(seen).map(function (k) { return seen[k]; });
    return all.filter(function (v) {
      return !all.some(function (w) { return isSubsetOf(v, w); });
    });
  }

  // --- naming -----------------------------------------------------------------

  /*
    Tokens in a group share a path prefix that says only which group they are
    in — 'colours/' in a group that exists because of the colour axes. It is
    the group key repeated on every leaf, so it comes off. Computed, not listed,
    and only whole segments are eligible.
  */
  function commonPrefix(names) {
    if (!names.length) return '';
    var parts = names[0].split('/');
    var depth = parts.length - 1;
    for (var i = 1; i < names.length && depth > 0; i++) {
      var p = names[i].split('/');
      var k = 0;
      while (k < depth && k < p.length - 1 && p[k] === parts[k]) k++;
      depth = k;
    }
    return depth ? parts.slice(0, depth).join('/') + '/' : '';
  }

  function stripPrefix(name, prefix) {
    return (prefix && name.indexOf(prefix) === 0) ? name.slice(prefix.length) : name;
  }

  /*
    '{textCase.none}' -> 'none'. Only these two scales, and only inside a
    composite: they are the ones code.js invents for the legacy tree, and the
    leaf of the reference IS the value the invented token holds.
  */
  var SYNTHESISED_SCALES = /^\{(textCase|textDecoration)\.([^}]+)\}$/;

  function inlineSynthesisedRefs(node) {
    if (!node || typeof node !== 'object') return node;
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (typeof v === 'string') {
        var m = SYNTHESISED_SCALES.exec(v);
        if (m) node[k] = m[2];
      } else if (v && typeof v === 'object') {
        inlineSynthesisedRefs(v);
      }
    });
    return node;
  }

  /*
    PLAIN NUMBERS WHERE THE VALUE IS NOT A LENGTH ON A PAGE.

    Figma has FLOAT and nothing finer, so `dimension` against `number` is this
    exporter's guess, made from scopes — and an elevation's offset, blur and
    spread, a grid's column count, the shadow scale under them, carry none. The
    reference document types them `number` and writes the bare figure; a
    reference (`{core.shadows.4}`) is left alone, only its type changes. Done
    BEFORE the shadow composites are inlined, because those inline a core value
    only when it is a plain number.
  */
  function toNumberToken(node) {
    if (!node || typeof node !== 'object' || node.$type !== 'dimension') return;
    var v = node.$value;
    if (v && typeof v === 'object' && typeof v.value === 'number') node.$value = v.value;
    node.$type = 'number';
  }

  function numberizeScale(group) {
    if (!group || typeof group !== 'object') return;
    Object.keys(group).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      var n = group[k];
      if (n && typeof n === 'object' && '$value' in n) toNumberToken(n);
      else numberizeScale(n);
    });
  }

  var SHADOW_PART = /^(x|y|blur|spread)$/;
  var COLUMN_LEAF = /^\d+-columns$/;

  function numberizeMeasures(tree) {
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach(function (k) {
        if (k.charAt(0) === '$') return;
        var n = node[k];
        if (!n || typeof n !== 'object') return;
        if ('$value' in n) {
          var inElevation = path.indexOf('elevation') !== -1 && SHADOW_PART.test(k);
          if (inElevation || COLUMN_LEAF.test(k)) toNumberToken(n);
        } else walk(n, path.concat(k));
      });
    })(tree, []);
  }

  /*
    THE TYPE EACH CORE SCALE HAS IN THE REFERENCE DOCUMENT.

    Again a guess the exporter makes, since Figma only says STRING or FLOAT:
    a family name is a `fontFamily`, a weight name a `fontWeight` (DTCG's
    keywords are lowercase, so 'Bold' becomes 'bold'), and the three scales
    that are lengths — font size, paragraph spacing, paragraph indent — are
    `dimension`s with a unit. Matched by group name, case-blind, because this
    runs before the names are lowercased.
  */
  var CORE_FAMILY = /^(fontfamilies|font-family|font-families)$/;
  var CORE_WEIGHT = /^(fontweights|font-weights)$/;
  var CORE_LENGTH = /^(fontsize|paragraphspacing|paragraphindent)$/;

  function retypeCore(core) {
    if (!core || typeof core !== 'object') return;
    Object.keys(core).forEach(function (g) {
      var name = g.toLowerCase();
      var group = core[g];
      if (!group || typeof group !== 'object' || '$value' in group) return;
      Object.keys(group).forEach(function (k) {
        var n = group[k];
        if (!n || typeof n !== 'object' || !('$value' in n)) return;
        if (CORE_FAMILY.test(name) && n.$type === 'text') n.$type = 'fontFamily';
        else if (CORE_WEIGHT.test(name) && n.$type === 'text') {
          n.$type = 'fontWeight';
          if (typeof n.$value === 'string' && n.$value.charAt(0) !== '{') n.$value = n.$value.toLowerCase();
        } else if (CORE_LENGTH.test(name) && n.$type === 'number' && typeof n.$value === 'number') {
          n.$type = 'dimension';
          n.$value = { value: n.$value, unit: 'px' };
        }
      });
    });
  }

  /* A typography scale's own `font-family` is a family name wherever it is. */
  function retypeFontFamilies(tree) {
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach(function (k) {
        if (k.charAt(0) === '$') return;
        var n = node[k];
        if (!n || typeof n !== 'object') return;
        if ('$value' in n) { if (k === 'font-family' && n.$type === 'text') n.$type = 'fontFamily'; }
        else walk(n);
      });
    })(tree);
  }

  // --- composites -------------------------------------------------------------

  /*
    code.js builds an elevation composite pointing at its own sibling flat
    tokens, which is what the legacy tree wants. In this shape there is no
    sibling for a consumer to follow, so each part goes one hop further: the
    colour lands on the core reference the sibling itself holds, and the
    dimensional parts resolve to a literal and take the dimension composite
    shape. `inset` is stated rather than left to the spec's default, which is
    what a consumer of this shape compares against.
  */
  function derefShadowComposites(branch, core, coreGroup) {
    var corePrefix = coreGroup + '.';
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if ('$value' in node) {
        if (node.$type === 'shadow' && node.$value && typeof node.$value === 'object') {
          var v = node.$value;
          ['color', 'offsetX', 'offsetY', 'blur', 'spread'].forEach(function (part) {
            var cur = v[part];
            if (typeof cur === 'string' && /^\{[^}]+\}$/.test(cur)) {
              var path = cur.slice(1, -1);
              if (path.indexOf(corePrefix) !== 0) {
                var sibling = lookupDotted(branch, path);
                if (sibling && '$value' in sibling) cur = sibling.$value;
              }
            }
            if (part !== 'color' && typeof cur === 'string' && cur.indexOf('{' + corePrefix) === 0) {
              var target = lookupDotted(core, cur.slice(1, -1).slice(corePrefix.length));
              if (target && '$value' in target && typeof target.$value === 'number') {
                cur = { value: target.$value, unit: 'px' };
              }
            }
            if (part !== 'color' && typeof cur === 'number') cur = { value: cur, unit: 'px' };
            v[part] = cur;
          });
          if (v.inset === undefined) v.inset = false;
        }
        return;
      }
      Object.keys(node).forEach(function (k) { if (k.charAt(0) !== '$') walk(node[k]); });
    })(branch);
  }

  // --- emit -------------------------------------------------------------------

  /*
    options.hooks       formatValue, formatFloatForExport, addTypographyComposite,
                        addElevationCompositesDeep (code.js), toDtcgFormat
                        (dtcg-format.js)
    options.pin         { axisCollectionName: modeName } — axes held at one mode
                        instead of becoming branches
    options.renameMode  (axisName, modeName) -> string, for the output path
    options.coreGroup   what to call the primitive group in references
    options.roots       override the derived consumption layer
    options.typeHints   (name, resolvedType, variable) -> type | null
    options.renameToken (name, groupKey, commonPrefix) -> string; defaults to
                        removing the group's common path prefix
    options.composites  false to skip the typography/elevation composite pass
  */
  function emit(collections, options) {
    options = options || {};
    var hooks = options.hooks || {};
    var pin = options.pin || {};
    var coreGroup = options.coreGroup || 'core';
    var renameMode = options.renameMode || keepModeName;

    var index = A.buildIndex(collections);
    var cls = A.classify(collections);

    var axes = cls.axes.filter(function (a) { return pin[a.name] === undefined; });
    var ordering = A.axisOrder(index, cls, { pin: pin, roots: options.roots });
    var order = ordering.order.filter(function (n) { return pin[n] === undefined; });

    var primitiveNames = cls.primitive.slice();
    var isPrimitive = {};
    primitiveNames.forEach(function (n) { isPrimitive[n] = true; });

    /*
      What to emit is a per-VARIABLE question, not a per-collection one: an axis
      collection can hold leaf tokens of its own that nothing aliases into, and
      taking whole collections drops them. options.roots still overrides, and is
      read as a collection filter when given.
    */
    var consumed = A.consumptionVariables(index, cls);
    if (options.roots) {
      var allow = {};
      options.roots.forEach(function (n) { allow[n] = true; });
      consumed = consumed.filter(function (c) { return allow[c.collection]; });
    }

    // Pass 1 — enumerate every consumed variable once. Everything downstream
    // reads these; re-walking per group would multiply a six-figure walk count.
    var plans = consumed.map(function (c) {
      var res = A.enumerateAdaptive(index, c.variable, axes, { pin: pin });
      var sig = {};
      Object.keys(res.branches).forEach(function (k) {
        (res.branches[k].dependsOn || []).forEach(function (d) { sig[d] = true; });
      });
      return {
        collection: c.collection,
        variable: c.variable,
        branches: res.branches,
        signature: order.filter(function (n) { return sig[n]; })
      };
    });

    var typeOf = deriveTypes(index, plans, options);

    function fmt(value) {
      if (value && typeof value === 'object' && value.r !== undefined && hooks.formatValue) {
        return hooks.formatValue(value, 'COLOR');
      }
      if (typeof value === 'number' && hooks.formatFloatForExport) {
        return hooks.formatFloatForExport(value);
      }
      return value;
    }

    // Walk to the primitive layer, then reference it rather than inline it.
    function refOrValue(variable, vector) {
      var r = A.resolve(index, variable, vector);
      if (r.terminal) {
        var tc = index.collectionOfVar[r.terminal.id];
        if (tc && isPrimitive[tc.name]) {
          return '{' + coreGroup + '.' + dotted(r.terminal.name) + '}';
        }
      }
      return fmt(r.value);
    }

    // --- primitives ---
    var primitives = {};
    primitiveNames.forEach(function (name) {
      var coll = index.collsByName[name];
      if (!coll) return;
      var modeId = (coll.modes[0] || {}).modeId;
      var tree = {};
      (coll.variables || []).forEach(function (v) {
        setDeep(tree, v.name, tokenNode(fmt(v.valuesByMode[modeId]), typeOf(v), v.description));
      });
      /*
        Typography composites reference {lineHeights.*} / {letterSpacing.*},
        which a file may only carry under its kebab spelling. code.js already
        backfills the camel forms so those references resolve rather than
        dangle; borrow it rather than keep a second copy, and only when the
        caller supplies it.
      */
      if (hooks.ensureCoreLineHeightsLetterSpacing) {
        hooks.ensureCoreLineHeightsLetterSpacing(tree);
      }
      primitives[name] = tree;
    });

    // --- groups, one per distinct dependency signature ---
    var buckets = {};
    plans.forEach(function (plan) {
      var key = plan.signature.length ? plan.signature.join('+') : '(static)';
      (buckets[key] = buckets[key] || []).push(plan);
    });

    var groups = {};
    Object.keys(buckets).forEach(function (key) {
      var members = buckets[key];
      /*
        A STATIC GROUP KEEPS ITS WHOLE NAMES. Stripping the longest common
        prefix is how a group of tokens that share a path stops repeating it —
        right for `colours/basic/*`, wrong here: the static group is whatever
        varies with nothing (radius, strokes, component sizes), a mixed bag
        whose only shared prefix is by accident. With `radius/*` alone in it,
        the prefix WAS "radius/", and every token lost the one word that says
        what it is.
      */
      var isStatic = key === '(static)';
      var prefix = isStatic ? '' : commonPrefix(members.map(function (p) { return p.variable.name; }));
      var rename;
      if (options.renameToken) rename = options.renameToken;
      else rename = function (name) { return stripPrefix(name, prefix); };
      var vectors = groupBranches(members, order);
      if (!vectors.length) vectors = [{}];

      var branches = vectors.map(function (vec) {
        var full = {};
        Object.keys(pin).forEach(function (k) { full[k] = pin[k]; });
        Object.keys(vec).forEach(function (k) { full[k] = vec[k]; });

        var tree = {};
        members.forEach(function (plan) {
          var nm = rename(plan.variable.name, key, prefix);
          /*
            The token's OWN description, not the one on whatever it resolves
            to. A semantic token and the primitive under it describe different
            things, and inheriting would attribute the primitive's note to
            every token that routes through it.
          */
          setDeep(tree, nm, tokenNode(
            refOrValue(plan.variable, full),
            typeOf(plan.variable),
            plan.variable.description
          ));
        });

        return {
          path: order.filter(function (n) { return vec[n] !== undefined; })
                     .map(function (n) { return renameMode(n, vec[n]); }),
          vector: vec,
          dependsOn: order.filter(function (n) { return vec[n] !== undefined; }),
          tokens: tree
        };
      });

      var sources = [];
      members.forEach(function (p) { if (sources.indexOf(p.collection) === -1) sources.push(p.collection); });

      groups[key] = {
        axes: members[0].signature.slice(),
        /* Which collections these tokens live in — a static group has no axis
           to name it by, so the layout names it after where it came from. */
        collections: sources,
        /* Each member's original name and where it landed inside the group —
           what the foundation layer needs to point back at it. */
        members: members.map(function (p) {
          return { collection: p.collection, name: p.variable.name,
                   path: rename(p.variable.name, key, prefix) };
        }),
        prefix: prefix,
        tokenCount: members.length,
        branches: branches
      };
    });

    // --- composites, built by code.js so there is one implementation of them ---
    if (options.composites !== false) {
      Object.keys(groups).forEach(function (key) {
        groups[key].branches.forEach(function (branch) {
          if (hooks.addElevationCompositesDeep) {
            hooks.addElevationCompositesDeep(branch.tokens, '', null);
          }
          if (hooks.addTypographyComposite && branch.tokens.typography) {
            var group = branch.tokens.typography;
            Object.keys(group).forEach(function (scale) {
              var scaleObj = group[scale];
              if (!scaleObj || typeof scaleObj !== 'object' || 'value' in scaleObj) return;
              group[scale] = hooks.addTypographyComposite(scaleObj, scale);
              /*
                textCase/textDecoration ride inside the composite's $extensions
                in this shape rather than as tokens of their own — so the
                standalone pair goes.

                And the composite refers to them as '{textCase.none}', a
                reference code.js writes for the legacy tree, where it also
                synthesises core.textCase.none to receive it. Neither scale is
                a Figma variable, so nothing synthesises them here and the
                reference had nowhere to land: 160 of them, dangling, inside
                $extensions. They are inlined as the literal the synthesised
                token would have held, which is what the reference document
                carries too — "textCase": "none", not a reference.
              */
              inlineSynthesisedRefs(group[scale]);
              delete group[scale]['text-case'];
              delete group[scale]['text-decoration'];
            });
          }
        });
      });
    }

    // --- DTCG conversion, by dtcg-format.js for the same reason ---
    var toDtcg = hooks.toDtcgFormat;
    function convert(tree) {
      if (!toDtcg) return tree;
      return toDtcg({ b: tree, $metadata: { tokenSetOrder: ['b'] } }, { shape: 'sets' }).tokens.b;
    }

    var outPrimitives = {};
    Object.keys(primitives).forEach(function (k) { outPrimitives[k] = convert(primitives[k]); });

    var coreTree = outPrimitives[primitiveNames[0]] || {};
    numberizeScale(coreTree.shadows);
    retypeCore(coreTree);
    Object.keys(groups).forEach(function (key) {
      groups[key].branches.forEach(function (branch) {
        branch.tokens = convert(branch.tokens);
        numberizeMeasures(branch.tokens);
        retypeFontFamilies(branch.tokens);
        derefShadowComposites(branch.tokens, coreTree, coreGroup);
      });
    });

    return {
      classification: cls,
      axisOrder: ordering.order,
      axes: axes,
      pinned: pin,
      primitives: outPrimitives,
      groups: groups
    };
  }

    // --- the document a consumer reads --------------------------------------

  function documentRaw(collections, options) {
    options = options || {};
    var hooks = options.hooks || {};

    var res = emit(collections, {
      hooks: hooks,
      pin: options.pin,
      renameMode: options.renameMode || slugRename,
      renameToken: options.renameToken,
      typeHints: options.typeHints
    });

    var derivedTotal = countResolvedTokens(res.primitives) + countResolvedTokens(res.groups);

    if (!options.axes) options.axes = detectLayoutRoles(res);

    if (options.axes && options.axes.scheme && options.axes.mode) {
      /*
        FIT THE LAYOUT BY HOLDING THE LEAST THAT MAKES IT FIT.

        Three levels cannot always hold a file's axes. When two branches claim
        one path, the axes they differ in are the ones with nowhere to go — and
        only those are held, at their collection's default mode.

        It iterates because removing an axis changes the answer: the innermost
        remaining one becomes the leaf, which can promote a different axis into
        collision. Each round holds only what the previous round proved could
        not be placed.

        Two things it will not do. It will not hold a ROLE — those are the
        levels themselves, and a file whose roles collide genuinely does not fit
        this layout. And it will not hold an axis that was never a culprit: the
        first version held every non-role axis, which pinned a fifteen-palette
        axis that NAMES the leaf and separated its branches perfectly well,
        throwing away fourteen readings to fix a collision they had no part in.

        Failing to fit is not an error. The derived shape goes out instead, and
        loses nothing.
      */
      var pinned = {};
      Object.keys(options.pin || {}).forEach(function (k) { pinned[k] = options.pin[k]; });
      var current = res;
      var roles = options.axes;
      var lastHouse = null;

      for (var round = 0; round < 5; round++) {
        lastHouse = shapeHouse(current, roles);
        if (!lastHouse.collisions.length) {
          lastHouse.document = finishFoundation(
            lastHouse.document, current, roles, collections,
            options.renameMode || slugRename,
            Object.keys(current.primitives)[0]);
          return {
            document: lastHouse.document, shape: 'house', roles: roles,
            /* The layout it just chose, said out loud — see shapeHouse. */
            levels: lastHouse.levels,
            autoPinned: Object.keys(pinned).length ? pinned : null,
            total: countResolvedTokens(lastHouse.document), emit: current
          };
        }
        var add = lastHouse.culprits.filter(function (n) {
          return n !== roles.breakpoint && n !== roles.scheme && n !== roles.mode && !pinned[n];
        });
        if (!add.length) {
          /*
            Only roles collide, so no further axis can be held to separate them —
            the minimal approach has gone as far as it can. Before giving up the
            layout entirely, try holding EVERY axis that is not a level: coarser,
            and it discards readings the minimal pass would have kept, but a
            document somebody can open beats the complete one that measured
            152 MB. If even that collides, the layout genuinely cannot express
            this file and the derived shape goes out.
          */
          var coarse = current.axes.map(function (a) { return a.name; }).filter(function (n) {
            return n !== roles.breakpoint && n !== roles.scheme && n !== roles.mode && !pinned[n];
          });
          if (!coarse.length) break;
          coarse.forEach(function (name) {
            var mode = defaultModeNameOf(collections, name);
            if (mode !== null) pinned[name] = mode;
          });
          current = emit(collections, {
            hooks: hooks,
            pin: pinned,
            renameMode: options.renameMode || slugRename,
            renameToken: options.renameToken,
            typeHints: options.typeHints
          });
          roles = detectLayoutRoles(current) || roles;
          continue;
        }
        add.forEach(function (name) {
          var mode = defaultModeNameOf(collections, name);
          if (mode !== null) pinned[name] = mode;
        });
        current = emit(collections, {
          hooks: hooks,
          pin: pinned,
          renameMode: options.renameMode || slugRename,
          renameToken: options.renameToken,
          typeHints: options.typeHints
        });
        roles = detectLayoutRoles(current) || roles;
      }

      var derivedDoc = shapeDerived(res);
      return {
        document: derivedDoc,
        shape: 'derived',
        roles: options.axes,
        total: derivedTotal,
        layoutCollisions: lastHouse ? lastHouse.collisions.length : 0,
        unplacedAxes: lastHouse ? lastHouse.culprits : [],
        levels: shapeDerived.levels,
        emit: res
      };
    }

    var plainDoc = shapeDerived(res);
    return { document: plainDoc, shape: 'derived', roles: null, total: derivedTotal,
             levels: shapeDerived.levels, emit: res };
  }

  /*
    WHICH AXIS PLAYS WHICH PART, WITHOUT ASKING.

    Two of the three are structural, and were right on every file measured:

      breakpoint  the axis some group depends on ALONE — a set of tokens that
                  vary by one thing and nothing else is a breakpoint set
      scheme      the first axis, in derived order, of the widest group — the
                  outermost question the colour surface asks

    The third is not structural, and an earlier version proving that is why this
    function exists. It took light/dark as the SECOND axis of the widest group,
    which is right when a scheme routes straight into it and wrong when a
    permission layer sits between — so on one real file it picked the permission
    layer and collapsed the document to 13% of itself. Nothing distinguishes the
    two structurally: both are collections of N modes a scheme passes through.

    So light/dark is read from the MODES, where the semantics actually live. A
    light/dark switch has modes called light and dark; a permission layer has
    modes called unrestricted and to-neutral. Nothing else in a file looks like
    the first. Ambiguity is refused rather than guessed: two candidates means no
    answer, and no answer means the derived shape, which loses nothing.
  */

  /*
    A MODE NAME AS A PATH SEGMENT.

    Figma mode names are written for the mode picker — 'S Mobile', 'XXL Large
    Desktop' — where the leading size code orders the list and the space reads
    fine. As a key in a document neither survives: a space in a path is awkward
    for every consumer, and the size code is the sidebar's ordering rather than
    part of the name.

    So: drop a leading size code when one is there, lowercase, and join the rest
    with hyphens. 'S Mobile' becomes 'mobile' and 'XXL Large Desktop' becomes
    'large-desktop', while a mode already written as a plain word — light, dark,
    unrestricted, aperitif — comes back untouched.

    Only a leading size code is dropped, and only when something follows it, so
    a mode legitimately called 'S' keeps its name.
  */
  function slugModeName(name) {
    var s = String(name === undefined || name === null ? '' : name).trim();
    if (!s) return s;
    var m = s.match(/^(?:X{0,3}[SML]|\d+)\s+(.+)$/i);
    if (m) s = m[1];
    return s.toLowerCase().replace(/\s+/g, '-');
  }

  function detectLayoutRoles(res) {
    var single = null;
    var widest = null;
    Object.keys(res.groups).forEach(function (k) {
      var g = res.groups[k];
      if (!g.axes.length) return;
      if (g.axes.length === 1 && !single) single = g.axes[0];
      if (!widest || g.axes.length > res.groups[widest].axes.length) widest = k;
    });
    if (!widest) return null;

    var wide = res.groups[widest].axes;
    var word = function (names, w) {
      return names.some(function (n) {
        return new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(String(n).toLowerCase());
      });
    };
    var candidates = res.axes.filter(function (a) {
      var names = a.modes || [];
      return word(names, 'light') && word(names, 'dark');
    });
    if (candidates.length !== 1) return null;

    var mode = candidates[0].name;
    var scheme = wide[0] === mode ? null : wide[0];
    if (!scheme) return null;

    return { breakpoint: single, scheme: scheme, mode: mode };
  }

  /*
    A collection's default mode, by name — the one Figma answers with when
    nothing has chosen. Measured on two real systems it is always the first mode
    and always the neutral reading, but the file states it, so read it rather
    than assume the ordering.
  */
  function defaultModeNameOf(collections, name) {
    for (var i = 0; i < collections.length; i++) {
      var c = collections[i];
      if (c.name !== name) continue;
      var modes = c.modes || [];
      for (var j = 0; j < modes.length; j++) {
        if (modes[j].modeId === c.defaultModeId) return modes[j].name;
      }
      return modes.length ? modes[0].name : null;
    }
    return null;
  }

  function countResolvedTokens(node) {
    var n = 0;
    (function walk(x) {
      if (!x || typeof x !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(x, '$value')) { n++; return; }
      Object.keys(x).forEach(function (k) { if (k.charAt(0) !== '$') walk(x[k]); });
    })(node);
    return n;
  }

  /*
    The derived form: the primitive collection, then one section per dependency
    signature, each branch nested by the path its walk actually took. Ragged on
    purpose — a branch carries only the questions that were asked of it, so a
    scheme that never enters the light/dark router has no light/dark segment.

    Section names are the group's axes with the leading punctuation Figma
    collection names carry ('.scheme', '_restricted') removed, because that
    punctuation orders collections in Figma's sidebar and means nothing here.
  */
  function shapeDerived(res) {
    var out = {};
    /* Same idea as shapeHouse's: this function chooses the nesting, so it can
       say what it chose. A section named "mode-scheme" puts its first axis at
       depth 1; only that one can be a Figma mode, since a collection has a
       single axis, and the rest stay in the names. */
    var levels = out.__levels = {};
    Object.keys(res.primitives).forEach(function (name) {
      out[name.replace(/^[._]+/, '')] = res.primitives[name];
    });
    Object.keys(res.groups).forEach(function (key) {
      var g = res.groups[key];
      var section = g.axes.length
        ? g.axes.map(function (a) { return a.replace(/^[._]+/, ''); }).join('-')
        : 'static';
      var node = out[section] = out[section] || {};
      if (g.axes.length && !levels[section]) {
        levels[section] = { '1': { role: 'mode', axis: g.axes[0] } };
      }
      g.branches.forEach(function (b) {
        var here = node;
        b.path.forEach(function (seg) { here = here[seg] = here[seg] || {}; });
        mergeResolvedInto(here, b.tokens);
      });
    });
    /* Carried out of band — it is metadata about the document, not part of
       it, and the caller lifts it into $figmaStructure. */
    delete out.__levels;
    shapeDerived.levels = levels;
    return out;
  }

  function mergeResolvedInto(target, src) {
    Object.keys(src).forEach(function (k) {
      var a = target[k], b = src[k];
      if (a && typeof a === 'object' && !('$value' in a) &&
          b && typeof b === 'object' && !('$value' in b)) mergeResolvedInto(a, b);
      else target[k] = b;
    });
    return target;
  }

  /*
    THE FOUNDATION LAYER — the semantic names, written once.

    The house layout above materialises every reading: `mode.light.neutral.…`,
    `mode.dark.amber.…`, `breakpoint.mobile.…`. A designer does not think in
    those; they think in the consumption layer's names (`colours.basic.text`,
    `spacing.component.4`), which hold the same tokens ONCE. This is that layer.

    Each foundation token points at its DEFAULT context — the first scheme, the
    light mode, the first breakpoint, read from the file — and says how to
    re-aim itself at any other with { layer, path } under one extension key:

      "$value": "{mode.light.neutral.basic.text}"
      "$extensions": { "com.desquared.radd": { "layer": "scheme", "path": "basic.text" } }

    layer "scheme"      -> mode.<mode>.<scheme>.<path>
    layer "breakpoint"  -> breakpoint.<breakpoint>.<path>

    A token that varies with neither (corner radii, stroke widths) was placed
    by shapeHouse and keeps pointing at its primitive, with no extension: there
    is nothing to re-aim.

    Descriptions are carried by cloning the context token, so they are exactly
    as present as in the layout itself.
  */
  var FOUNDATION_NS = 'com.desquared.radd';

  /*
    Only the leaf tokens a consumption variable owns are mirrored, plus the
    siblings code.js synthesises beside them (a typography or elevation
    composite sits next to the scalars it is built from) — so the unit is the
    PARENT GROUP of a foundation token, not the token.
  */
  function consumptionRoot(res) {
    var consumed = ((res.classification && res.classification.consumption) || []);
    var name = consumed.length === 1 ? consumed[0].replace(/^[._]+/, '') : '';
    if (!name || name === 'core' || name === 'breakpoint' || name === 'mode') return 'foundation';
    return name;
  }

  function isTokenNode(n) { return !!n && typeof n === 'object' && ('$value' in n); }

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  /*
    Move what is under `tree[key]` up into `tree`, without clobbering anything.
    The consumption layer groups its colours under `colours` and the breakpoint
    collection names its own leaves `breakpoint/…`; neither word is part of the
    path a consumer reads, so both are lifted out. A name that already exists
    beside the group is left where it was when the two differ — losing a value
    to a tidy-up would be worse than a deeper path.
  */
  function hoistGroup(tree, key) {
    var g = tree[key];
    if (!g || typeof g !== 'object' || isTokenNode(g)) return;
    function lift(dst, src) {
      Object.keys(src).forEach(function (k) {
        if (k === key && dst === tree) return;
        if (!(k in dst)) { dst[k] = src[k]; delete src[k]; return; }
        var a = dst[k], b = src[k];
        if (stable(a) === stable(b)) { delete src[k]; return; }
        if (a && b && typeof a === 'object' && typeof b === 'object' &&
            !isTokenNode(a) && !isTokenNode(b)) {
          lift(a, b);
          if (!Object.keys(b).length) delete src[k];
        }
      });
    }
    lift(tree, g);
    if (!Object.keys(g).length) delete tree[key];
  }

  /* The path a consumption variable has inside its layer, after the lifts. */
  function layerPath(layer, relPath) {
    var parts = relPath.split('/');
    var drop = layer === 'scheme' ? 'colours' : 'breakpoint';
    if (parts.length > 1 && parts[0] === drop) parts = parts.slice(1);
    return parts;
  }

  function cloneNode(n) { return JSON.parse(JSON.stringify(n)); }

  function finishFoundation(out, res, roles, collections, renameMode, primitiveName) {
    // 1. Tidy names inside the two layers.
    Object.keys(out.breakpoint).forEach(function (bp) { hoistGroup(out.breakpoint[bp], 'breakpoint'); });
    Object.keys(out.mode).forEach(function (m) {
      Object.keys(out.mode[m]).forEach(function (leaf) { hoistGroup(out.mode[m][leaf], 'colours'); });
    });

    // 2. The default context, read from the file.
    function defaultOf(axis) {
      var raw = axis ? defaultModeNameOf(collections, axis) : null;
      return raw === null ? null : renameMode(axis, raw);
    }
    var defaults = {
      mode: defaultOf(roles.mode),
      scheme: defaultOf(roles.scheme),
      breakpoint: defaultOf(roles.breakpoint)
    };
    var modeNames = Object.keys(out.mode);
    if (defaults.mode === null || modeNames.indexOf(defaults.mode) === -1) defaults.mode = modeNames[0] || null;
    var firstMode = defaults.mode && out.mode[defaults.mode] ? out.mode[defaults.mode] : {};
    if (defaults.scheme === null || !(defaults.scheme in firstMode)) defaults.scheme = Object.keys(firstMode)[0] || null;
    var bpNames = Object.keys(out.breakpoint);
    if (defaults.breakpoint === null || bpNames.indexOf(defaults.breakpoint) === -1) defaults.breakpoint = bpNames[0] || null;

    // 3. Which parent groups the consumption layer owns, per layer.
    var consumed = {};
    ((res.classification && res.classification.consumption) || []).forEach(function (n) { consumed[n] = true; });
    var owned = { breakpoint: {}, scheme: {} };
    Object.keys(res.groups).forEach(function (key) {
      var g = res.groups[key];
      if (!g.axes.length) return;
      var layer = (roles.breakpoint && g.axes.indexOf(roles.breakpoint) !== -1) ? 'breakpoint'
                : (roles.scheme && g.axes.indexOf(roles.scheme) !== -1) ? 'scheme' : null;
      if (!layer) return;
      (g.members || []).forEach(function (m) {
        if (!consumed[m.collection]) return;
        /* Two addresses for one token. Inside the layout it has the path the
           lifts left it with; in the foundation layer it keeps its WHOLE
           original name — `colours.basic.text`, not `basic.text` — because
           that is the name a designer reads in Figma. */
        var house = layerPath(layer, m.path);
        var found = m.name.split('/');
        var key = house.slice(0, -1).join('/') + '|' + found.slice(0, -1).join('/');
        var entry = owned[layer][key] || (owned[layer][key] = {
          house: house.slice(0, -1), found: found.slice(0, -1), leaves: {} });
        entry.leaves[house[house.length - 1]] = true;
      });
    });

    // 4. Mirror them, pointing at the default context.
    var rootName = consumptionRoot(res);
    var foundation = out[rootName] || {};
    var contexts = {
      breakpoint: defaults.breakpoint && out.breakpoint[defaults.breakpoint]
        ? { node: out.breakpoint[defaults.breakpoint], path: ['breakpoint', defaults.breakpoint] } : null,
      scheme: defaults.mode && defaults.scheme && firstMode[defaults.scheme]
        ? { node: firstMode[defaults.scheme], path: ['mode', defaults.mode, defaults.scheme] } : null
    };
    function walk(node, parts, make) {
      for (var i = 0; i < parts.length; i++) {
        if (!node || typeof node !== 'object' || isTokenNode(node)) return undefined;
        if (!node[parts[i]]) { if (!make) return undefined; node[parts[i]] = {}; }
        node = node[parts[i]];
      }
      return node;
    }
    ['scheme', 'breakpoint'].forEach(function (layer) {
      var ctx = contexts[layer];
      if (!ctx) return;
      Object.keys(owned[layer]).forEach(function (pk) {
        var entry = owned[layer][pk];
        var src = entry.house.length ? walk(ctx.node, entry.house, false) : ctx.node;
        if (!src || typeof src !== 'object' || isTokenNode(src)) return;
        Object.keys(src).forEach(function (k) {
          var child = src[k];
          if (!isTokenNode(child)) return;
          /* Below the root, every leaf of the group — which is how a composite
             built beside its scalars comes along. AT the root the group's
             siblings are unrelated tokens from other groups, so only the
             members themselves are taken. */
          if (!entry.house.length && !entry.leaves[k]) return;
          var dest = walk(foundation, entry.found, true);
          if (!dest || (dest[k] && isTokenNode(dest[k]))) return;
          var node = cloneNode(child);
          var here = entry.house.concat([k]);
          node.$value = '{' + ctx.path.concat(here).join('.') + '}';
          var ext = {};
          Object.keys(node.$extensions || {}).forEach(function (e) { ext[e] = node.$extensions[e]; });
          ext[FOUNDATION_NS] = { layer: layer, path: here.join('.') };
          node.$extensions = ext;
          dest[k] = node;
        });
      });
    });
    if (Object.keys(foundation).length) out[rootName] = foundation;

    // 5. Say what the document is, so a reader need not infer it.
    var leafNames = Object.keys(firstMode);
    var schemeAxis = null;
    (res.axes || []).forEach(function (a) { if (a.name === roles.scheme) schemeAxis = a; });
    var axisSchemes = schemeAxis ? schemeAxis.modes.map(function (m) { return renameMode(roles.scheme, m); }) : [];
    var schemes = axisSchemes.filter(function (n) { return leafNames.indexOf(n) !== -1; })
      .concat(leafNames.filter(function (n) { return axisSchemes.indexOf(n) === -1; }));
    var accent = leafNames.filter(function (n) { return axisSchemes.indexOf(n) === -1; });
    var independent = schemes.filter(function (sch) {
      var ref = stable(out.mode[modeNames[0]] && out.mode[modeNames[0]][sch]);
      return modeNames.every(function (m) { return stable(out.mode[m] && out.mode[m][sch]) === ref; });
    });
    var meta = {};
    meta[FOUNDATION_NS] = {
      modes: modeNames,
      schemes: schemes,
      modeIndependentSchemes: independent,
      accentSchemes: accent,
      foundationDefaults: { mode: defaults.mode, scheme: defaults.scheme, breakpoint: defaults.breakpoint },
      foundationContext: 'A foundation token with $extensions["' + FOUNDATION_NS + '"] { layer: "scheme", path } ' +
        'resolves to mode.<mode>.<scheme>.<path>; { layer: "breakpoint", path } resolves to ' +
        'breakpoint.<breakpoint>.<path>. Its $value is that resolution for foundationDefaults.'
    };
    var ordered = {
      $description: 'Design tokens, W3C DTCG. Mode-independent primitives live under `core` and `breakpoint`; ' +
        'every colour scheme is resolved per mode as `mode.<mode>.<scheme>`. DTCG has no native modes ' +
        'concept, so the light/dark switching is a naming convention. The semantic layer lives once under `' +
        rootName + '`: each token aliases its default context (see `foundationDefaults`), and a contextual one ' +
        'carries `$extensions["' + FOUNDATION_NS + '"]` `{ layer, path }` to re-target it at any other mode, ' +
        'scheme or breakpoint.',
      $extensions: meta
    };
    var first = ['core', rootName, 'breakpoint', 'mode'];
    first.forEach(function (k) { if (out[k] !== undefined) ordered[k] = out[k]; });
    Object.keys(out).forEach(function (k) { if (!(k in ordered)) ordered[k] = out[k]; });
    return ordered;
  }

  /*
    core / breakpoint.<mode> / mode.<mode>.<scheme> — one system's convention,
    applied only when that system names the roles it needs.
  */
  function shapeHouse(res, roles) {
    var primitiveName = Object.keys(res.primitives)[0];
    var out = { core: res.primitives[primitiveName] || {}, breakpoint: {}, mode: {} };
    /*
      WHICH BRANCH CLAIMED EACH DESTINATION. Token counts cannot answer whether a
      layout fits: this one deliberately REPEATS a mode-independent scheme under
      every mode, so a healthy house document holds more tokens than the branches
      it was built from. What must not happen is two DIFFERENT branches landing on
      one path, because the second silently replaces the first.
    */
    var claimedBy = {};
    var collisions = [];
    var culprits = {};
    function claim(dest, branchKey, vector) {
      var prev = claimedBy[dest];
      if (prev === undefined) { claimedBy[dest] = { key: branchKey, vector: vector }; return; }
      if (prev.key === branchKey) return;
      collisions.push(dest);
      /*
        WHICH AXIS MADE THEM COLLIDE. Two branches on one path differ somewhere,
        and the axes they differ in are the ones this layout has nowhere to put.
        Only those need holding still — an axis the layout CAN express, like the
        one that ends up naming the leaf, distinguishes its branches perfectly
        well and pinning it would throw away readings for nothing.
      */
      Object.keys(vector).forEach(function (a) {
        if (prev.vector[a] !== vector[a]) culprits[a] = true;
      });
      Object.keys(prev.vector).forEach(function (a) {
        if (vector[a] === undefined) culprits[a] = true;
      });
    }
    var modeAxis = null;
    res.axes.forEach(function (a) { if (a.name === roles.mode) modeAxis = a; });
    var allModes = (modeAxis && modeAxis.modes) || [];

    /*
      A GROUP THAT VARIES WITH NOTHING STILL HAS TO GO SOMEWHERE.

      core / breakpoint / mode have a place for what varies with a breakpoint
      and for what varies with a scheme. A token that varies with neither —
      corner radii, stroke widths, component sizes, all aliases of a single
      primitive — matched neither branch below and was skipped by the scheme
      test, silently: no error, no count, just absent from the document. A
      file with eleven such tokens shipped without them and nothing said so.

      They get a root of their own, named after the collection they live in
      (`foundation`), so the name a designer knows them by survives. When they
      come from several collections, or the collection's name would collide
      with one of the three roots, the root is `static` — the name the derived
      layout already gives this group.
    */
    function staticRoot(group) {
      var from = group.collections || [];
      var consumed = (res.classification && res.classification.consumption) || [];
      /* Tokens that live in the consumption collection share the root the
         foundation layer is built under (see finishFoundation). */
      if (from.length && from.every(function (n) { return consumed.indexOf(n) !== -1; })) {
        return consumptionRoot(res);
      }
      var name = from.length === 1 ? from[0].replace(/^[._]+/, '') : '';
      if (!name || name === 'core' || name === 'breakpoint' || name === 'mode' ||
          name === primitiveName || (res.primitives[primitiveName] && name === primitiveName.replace(/^[._]+/, ''))) {
        return 'static';
      }
      return name;
    }

    Object.keys(res.groups).forEach(function (key) {
      var group = res.groups[key];
      if (!group.axes.length) {
        var rootName = staticRoot(group);
        out[rootName] = out[rootName] || {};
        group.branches.forEach(function (br) { mergeResolvedInto(out[rootName], br.tokens); });
        return;
      }
      group.branches.forEach(function (br) {
        var v = br.vector;

        if (roles.breakpoint && v[roles.breakpoint] !== undefined) {
          var bi = br.dependsOn.indexOf(roles.breakpoint);
          var bp = (bi >= 0 && br.path[bi]) || v[roles.breakpoint];
          claim('breakpoint/' + bp, key + '#' + br.path.join('/'), v);
          out.breakpoint[bp] = mergeResolvedInto(out.breakpoint[bp] || {}, br.tokens);
          return;
        }
        if (v[roles.scheme] === undefined) return;

        var leafAxes = br.dependsOn.filter(function (n) { return n !== roles.mode; });
        var leafIdx = br.dependsOn.indexOf(leafAxes[leafAxes.length - 1]);
        var leaf = br.path[leafIdx];
        var mi = br.dependsOn.indexOf(roles.mode);
        var modes = mi >= 0 ? [br.path[mi]] : allModes;
        modes.forEach(function (mm) {
          claim('mode/' + mm + '/' + leaf, key + '#' + br.path.join('/'), v);
          out.mode[mm] = out.mode[mm] || {};
          /* A branch that does not ask the light/dark question lands in EVERY
             mode — a copy each, never the one tree shared: the passes after
             this one (hoisting a level out of a group) move nodes, and a
             shared node moved for `light` left `dark` with an empty group. */
          out.mode[mm][leaf] = mergeResolvedInto(out.mode[mm][leaf] || {}, mi >= 0 ? br.tokens : cloneNode(br.tokens));
        });
      });
    });
    /*
      WHERE EACH AXIS WENT, so a reader does not have to work it out again.

      This function has just DECIDED the nesting: breakpoint's values sit one
      level under `breakpoint`, and the mode axis one level under `mode`. That
      is precisely the level map an import otherwise has to ask a human for —
      and here it is not a guess at all, because we put them there.

      Depth 1, not 0: a DTCG path keeps its top-level group, so
      `mode.light.neutral...` has `mode` at 0 and the axis at 1.

      Only the axes this layout gave a level of their own are declared. The
      scheme axis ends up naming the leaf and is NOT a level, so it is left
      for the import to ask about — saying nothing is better than declaring a
      reading that was never made.
    */
    var levels = {};
    if (Object.keys(out.breakpoint).length && roles.breakpoint) {
      levels.breakpoint = { '1': { role: 'mode', axis: roles.breakpoint } };
    }
    if (Object.keys(out.mode).length && roles.mode) {
      levels.mode = { '1': { role: 'mode', axis: roles.mode } };
    }
    return { document: out, collisions: collisions, culprits: Object.keys(culprits), levels: levels };
  }


  /*
    EVERY NAME IS LOWERCASE.

    Figma lets a variable be called `FAB` or `title-L`; the document a consumer
    reads has none of that — `fab`, `title-l`, `fontsize` — so two files that
    differ only by case line up instead of showing every token twice. Keys,
    alias targets and the { layer, path } re-targeting extension all go through
    the same function, so a reference never points at a name that was changed
    under it. Keys starting with `$` are DTCG's own and stay as they are.

    Two names that differ only by case merge into one group; where two LEAVES
    would collapse onto each other the first wins and the loser is reported in
    `lowercased.collisions` rather than silently overwritten.
  */
  function lowerName(s) { return String(s).toLowerCase(); }

  function lowerRefs(v) {
    if (typeof v === 'string') {
      return v.replace(/\{([^{}]+)\}/g, function (_, p) { return '{' + lowerName(p) + '}'; });
    }
    if (Array.isArray(v)) return v.map(lowerRefs);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = lowerRefs(v[k]); });
      return o;
    }
    return v;
  }

  function lowercaseDocument(doc) {
    var collisions = [];
    function isToken(n) { return n && typeof n === 'object' && '$value' in n; }
    function walk(node, path) {
      var out = {};
      Object.keys(node).forEach(function (k) {
        var v = node[k];
        if (k.charAt(0) === '$') {
          if (k === '$value') out[k] = lowerRefs(v);
          else if (k === '$extensions' && v && typeof v === 'object') {
            var e = {};
            Object.keys(v).forEach(function (ns) {
              var x = v[ns];
              if (ns === 'com.desquared.radd' && x && typeof x.path === 'string') {
                var c = {}; Object.keys(x).forEach(function (f) { c[f] = f === 'path' ? lowerName(x[f]) : x[f]; });
                e[ns] = c;
              } else e[ns] = x;
            });
            out[k] = e;
          } else out[k] = v;
          return;
        }
        var nk = lowerName(k);
        var child = (v && typeof v === 'object' && !isToken(v)) ? walk(v, path.concat(nk))
                  : (isToken(v) ? walk(v, path.concat(nk)) : v);
        if (nk in out) {
          if (isToken(out[nk]) || isToken(child)) { collisions.push(path.concat(nk).join('.')); return; }
          merge(out[nk], child, path.concat(nk));
        } else out[nk] = child;
      });
      return out;
    }
    function merge(a, b, path) {
      Object.keys(b).forEach(function (k) {
        if (k.charAt(0) === '$') { if (!(k in a)) a[k] = b[k]; return; }
        if (!(k in a)) a[k] = b[k];
        else if (isToken(a[k]) || isToken(b[k])) collisions.push(path.concat(k).join('.'));
        else merge(a[k], b[k], path.concat(k));
      });
    }
    return { document: walk(doc, []), collisions: collisions };
  }

  /*
    The DTCG writer stamps every token with $extensions["com.closure.legacyJson"]
    = { type }, the Legacy JSON type it was converted from. That is what lets a
    round trip back to the legacy tree recover it; this shape is never read back
    that way, and the reference document carries nothing like it. It goes — and
    the $extensions object with it when nothing else is in there. Anything else
    the extension holds (aliasCollection, which the import uses to disambiguate
    a reference) is kept.
  */
  var LEGACY_EXT = 'com.closure.legacyJson';
  function stripLegacyExtension(node) {
    if (!node || typeof node !== 'object') return;
    var ext = node.$extensions;
    if (ext && typeof ext === 'object' && ext[LEGACY_EXT] && typeof ext[LEGACY_EXT] === 'object' && '$value' in node) {
      delete ext[LEGACY_EXT].type;
      /* A typography composite keeps textCase, textDecoration and the paragraph
         values here, because DTCG's typography type has no place for them. The
         reference document holds them under the Tokens Studio key, flat. */
      if (ext[LEGACY_EXT].typography && typeof ext[LEGACY_EXT].typography === 'object') {
        ext['com.tokens-studio'] = ext[LEGACY_EXT].typography;
        delete ext[LEGACY_EXT].typography;
      }
      if (!Object.keys(ext[LEGACY_EXT]).length) delete ext[LEGACY_EXT];
      if (!Object.keys(ext).length) delete node.$extensions;
    }
    Object.keys(node).forEach(function (k) {
      if (k.charAt(0) !== '$') stripLegacyExtension(node[k]);
    });
  }

  /*
    THE `restore` SECTION — what a Resolved export evaluates away, written down
    once, at the END of the document, where a reader that wants it can find it
    and one that does not never looks.

    It is read-only and advisory. Nothing in it is a token and nothing in it
    changes what a token means; an importer that finds it uses it to put back
    what the export took out, and one that does not falls back to the rules in
    architecture-radd.js. Every entry is keyed by the path the thing has IN THE
    DOCUMENT, so a section that has fallen behind its tokens (the file was edited
    after the export) loses entries rather than misdirecting them.

      architecture   which template reads this document, when the graph has one
      collections    the file's collections in the order its panel shows them,
                     with their modes — names the document had to flatten
      scopes         where Figma offers each consumption-layer variable, grouped
                     by set. An empty set is kept: it means hidden from pickers,
                     which is not the default.
      links          a consumption token whose layer variable has a DIFFERENT
                     name, and is read by that token alone — a rename, which the
                     document's own names cannot express. (A layer variable two
                     tokens share is not recorded: the importer names the copy
                     after the token that reads it.)
      synthesized    core tokens the exporter made up for itself; they are not
                     variables and an import should not make them so
  */
  /*
    THE -SUBTLE PALETTE LEAVES. A Resolved document keeps, for every (mode, scheme),
    the one leaf that scheme lands on by default — section `normal`, card `not-a-card`.
    The `-subtle` leaves (white-subtle/…, secondary-light-subtle/…) are reached only
    through the other section and card modes, so nothing in the document's cells
    holds them, and which core colour each one points at is a design decision, not
    a rule (src/architecture-ods.js). They are written here: palette collection ->
    variable name (lower case) -> mode -> the core variable it aliases, as a dotted
    path in the document (`core.core-colours.neutral.light.100`). A value that is
    not an alias into the primitive collection is counted in `other`, not written.
  */
  /* The primitives' own scopes, where they are not the empty list: `restore.scopes` covers only the
     consumption layer. [{ scopes, paths }], a path as in the document (`core.core-colours.x`). */
  function restoreCoreScopes(collections) {
    var prim = collections.filter(function (c) { return /^[._]?core$/i.test(c.name); })[0];
    if (!prim) return null;
    var groups = {}, order = [];
    (prim.variables || []).forEach(function (v) {
      var sc = (v.scopes || []).slice().sort();
      if (!sc.length) return;
      var key = sc.join(',');
      if (!groups[key]) { groups[key] = { scopes: sc, paths: [] }; order.push(key); }
      groups[key].paths.push('core.' + String(v.name).toLowerCase().split('/').join('.'));
    });
    if (!order.length) return null;
    return order.map(function (k) { groups[k].paths.sort(); return groups[k]; });
  }

  function restoreSubtle(collections) {
    var byId = {};
    collections.forEach(function (c) { (c.variables || []).forEach(function (v) { byId[v.id] = { c: c, v: v }; }); });
    var out = {}, count = 0, other = 0;
    collections.forEach(function (c) {
      if (AO.PALETTES.indexOf(c.name) === -1) return;
      var modeName = {};
      (c.modes || []).forEach(function (m) { modeName[m.modeId] = m.name; });
      (c.variables || []).forEach(function (v) {
        if (!/^[^/]*-subtle\//.test(String(v.name))) return;
        var cell = {};
        Object.keys(v.valuesByMode || {}).forEach(function (mid) {
          var x = v.valuesByMode[mid];
          var t = x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS' ? byId[x.id] : null;
          if (t && /^[._]?core$/i.test(t.c.name)) cell[modeName[mid] || mid] = 'core.' + String(t.v.name).toLowerCase().split('/').join('.');
          else other++;
        });
        if (!Object.keys(cell).length) return;
        if (!out[c.name]) out[c.name] = {};
        out[c.name][String(v.name).toLowerCase()] = cell;
        count++;
      });
    });
    if (!count) return null;
    return { leaves: out, count: count, other: other };
  }

  /*
    THE HOPS INSIDE .breakpoint. The document keeps one breakpoint variable per
    token the consumption layer reads. A file can also route THROUGH others
    (`grid/gutters` -> `stretch-grid/gutters` -> core) or hold one nothing reads
    (`fixed-grid/gutters`); the evaluated document has neither. Written here:
      extras  the variables no consumption token reads, per mode: where each points
      via     a variable the document does have, whose alias goes to another variable
              of this collection (an extra, or one the document has: `layout/margins-cards`
              reads `overflow-grid/margins` in one mode and `grid/margins` in the others)
    A target is `core.<dotted path>`, `<collection>::<name>`, or { value } for a
    literal. Names are lower case, as the document spells them.
  */
  function restoreHops(collections, visible) {
    var bp = collections.filter(function (c) { return c.name === '.breakpoint'; })[0];
    if (!bp) return null;
    var byId = {};
    collections.forEach(function (c) { (c.variables || []).forEach(function (v) { byId[v.id] = { c: c, v: v }; }); });
    var modeName = {};
    (bp.modes || []).forEach(function (m) { modeName[m.modeId] = m.name; });
    var low = function (n) { return String(n).toLowerCase(); };
    var spec = function (x) {
      var t = x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS' ? byId[x.id] : null;
      if (!t) return { value: x };
      if (/^[._]?core$/i.test(t.c.name)) return 'core.' + low(t.v.name).split('/').join('.');
      return t.c.name + '::' + low(t.v.name);
    };
    var extras = {}, via = {}, nExtra = 0, nVia = 0;
    (bp.variables || []).forEach(function (v) {
      var seen = !!visible[v.id];
      Object.keys(v.valuesByMode || {}).forEach(function (mid) {
        var x = v.valuesByMode[mid];
        if (!seen) {
          if (!extras[low(v.name)]) { extras[low(v.name)] = {}; nExtra++; }
          extras[low(v.name)][modeName[mid] || mid] = spec(x);
          return;
        }
        var t = x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS' ? byId[x.id] : null;
        if (t && t.c.id === bp.id) {
          if (!via[low(v.name)]) { via[low(v.name)] = {}; nVia++; }
          via[low(v.name)][modeName[mid] || mid] = low(t.v.name);
        }
      });
    });
    if (!nExtra && !nVia) return null;
    return { extras: extras, via: via };
  }

  /*
    THE DESCRIPTIONS of the layers under the consumption layer. The document keeps a
    description only for a token of its own groups; the routing layers and the palettes
    carry thousands more (6,779 variables in the ODS file against 3,030 the document
    holds), written from one template per layer with the path P in it. Stored as
    `{ t, n }`: the text with P replaced by `{P}`, and the names (lower case) it is for.
    A description that does not come back exactly from its template is written as it is
    (`lit`), so what is stored always expands to what the file had.
  */
  function restoreDescriptions(collections) {
    var out = {}, count = 0;
    collections.forEach(function (c) {
      if (AO.PREFIX_SEGMENTS[c.name] === undefined) return;
      var byText = {}, order = [], lits = [];
      (c.variables || []).forEach(function (v) {
        var d = v.description;
        if (!d) return;
        var name = String(v.name).toLowerCase();
        var P = AO.pathOf(c.name, name);
        var t = P ? d.split(P).join('{P}') : d;
        if (d.indexOf('{P}') !== -1 || t.split('{P}').join(P) !== d) { lits.push({ t: d, n: [name], lit: 1 }); count++; return; }
        if (!byText[t]) { byText[t] = { t: t, n: [] }; order.push(t); }
        byText[t].n.push(name);
        count++;
      });
      var groups = order.map(function (t) { return byText[t]; }).concat(lits);
      if (groups.length) out[c.name] = groups;
    });
    return count ? out : null;
  }

  function buildRestore(collections, doc, rootName, styles) {
    var root = doc && doc[rootName];
    if (!root || typeof root !== 'object') return null;
    var low = function (s) { return String(s).toLowerCase(); };
    var dotted = function (s) { return low(s).split('/').join('.'); };
    var leaves = {};
    (function walk(o, p) {
      Object.keys(o).forEach(function (k) {
        if (k.charAt(0) === '$') return;
        var v = o[k];
        if (v && typeof v === 'object' && '$value' in v) leaves[p.concat(k).join('.')] = v;
        else if (v && typeof v === 'object') walk(v, p.concat(k));
      });
    })(root, [rootName]);

    var out = {};
    if (AR && AR.detectInCollections(collections)) out.architecture = { id: AR.ID, version: AR.VERSION };
    else if (AO && AO.detectInCollections(collections)) {
      out.architecture = { id: AO.ID, version: AO.VERSION };
      var subtle = restoreSubtle(collections);
      if (subtle) out.subtle = subtle;
      var descs = restoreDescriptions(collections);
      if (descs) out.descriptions = descs;
      var cs = restoreCoreScopes(collections);
      if (cs) out.coreScopes = cs;
    }

    out.collections = collections.map(function (c) {
      var def = (c.modes || []).filter(function (m) { return m.modeId === c.defaultModeId; })[0];
      return { name: c.name, modes: (c.modes || []).map(function (m) { return m.name; }),
               defaultMode: def ? def.name : undefined, variables: (c.variables || []).length };
    });

    // scopes, links — for the variables whose tokens are in the consumption root
    var byId = {};
    collections.forEach(function (c) { (c.variables || []).forEach(function (v) { byId[v.id] = { c: c, v: v }; }); });
    var groups = {}, order = [];
    var consumers = {};                       // target variable id -> how many consumption tokens read it
    var firstHop = {};                        // token path -> { id, c, v }
    collections.forEach(function (c) {
      (c.variables || []).forEach(function (v) {
        var path = rootName + '.' + dotted(v.name);
        if (!leaves[path]) return;
        var key = (v.scopes || []).slice().sort().join(',');
        if (!groups[key]) { groups[key] = { scopes: (v.scopes || []).slice().sort(), paths: [] }; order.push(key); }
        groups[key].paths.push(path);
        var modeId = c.defaultModeId;
        var x = (v.valuesByMode || {})[modeId];
        if (x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS' && byId[x.id]) {
          firstHop[path] = byId[x.id];
          consumers[x.id] = (consumers[x.id] || 0) + 1;
        }
      });
    });
    out.scopes = order.map(function (k) { groups[k].paths.sort(); return groups[k]; });

    var links = {};
    Object.keys(firstHop).forEach(function (path) {
      var leaf = leaves[path];
      var x = leaf.$extensions && leaf.$extensions[FOUNDATION_NS];
      if (!x || x.layer !== 'breakpoint') return;
      var t = firstHop[path];
      if (consumers[t.v.id] !== 1) return;
      var bare = String(t.v.name);
      var head = low(String(t.c.name).replace(/^[._]+/, ''));
      var seg = bare.split('/');
      if (low(seg[0]) === head) seg = seg.slice(1);
      var actual = dotted(seg.join('/'));
      if (actual !== x.path) links[path] = actual;
    });
    if (Object.keys(links).length) out.links = links;

    if (out.architecture && AO && out.architecture.id === AO.ID) {
      var seenIds = {};
      Object.keys(firstHop).forEach(function (path) { seenIds[firstHop[path].v.id] = true; });
      var hops = restoreHops(collections, seenIds);
      if (hops) out.hops = hops;
    }

    // core tokens that are not variables of the primitive collection
    var prim = collections.filter(function (c) { return /^[._]?core$/i.test(c.name); })[0];
    if (prim && doc.core) {
      var real = {};
      prim.variables.forEach(function (v) { real[dotted(v.name)] = true; });
      var synth = [];
      (function walk(o, p) {
        Object.keys(o).forEach(function (k) {
          if (k.charAt(0) === '$') return;
          var v = o[k];
          if (v && typeof v === 'object' && '$value' in v) { var path = p.concat(k).join('.'); if (!real[path]) synth.push('core.' + path); }
          else if (v && typeof v === 'object') walk(v, p.concat(k));
        });
      })(doc.core, []);
      if (synth.length) out.synthesized = synth.sort();
    }

    var st = restoreStyles(styles);
    if (st) out.styles = st;
    return out;
  }

  /*
    THE STYLES, as the document records them: what each one IS, in the file's
    own words — exact names (the section has none of the lowercase the tokens
    are written in), the font, case and decoration, the values, and which
    variable each field is bound to. A variable is named `collection::name` with
    the NAME LOWERCASED, because that is how the document spells every variable
    and how an import will find it.

    Only a style that arrived as a DEFINITION is written. An older extract that
    carried an id and a name (styles-capture.js falls back to that if a read
    fails) says nothing worth recording, and a section that claimed to would
    send an import to build a style out of nothing.
  */
  function restoreStyles(styles, exact) {
    if (!styles) return null;
    var low = function (b) {
      var o = {};
      if (exact) { Object.keys(b || {}).forEach(function (f) { o[f] = b[f]; }); return o; }
      Object.keys(b || {}).forEach(function (f) {
        var i = String(b[f]).indexOf('::');
        o[f] = i === -1 ? String(b[f]).toLowerCase() : b[f].slice(0, i + 2) + b[f].slice(i + 2).toLowerCase();
      });
      return o;
    };
    var text = (styles.textStyles || []).filter(function (s) { return s && s.fontName; }).map(function (s) {
      return { name: s.name, description: s.description || '', fontName: s.fontName,
               textCase: s.textCase, textDecoration: s.textDecoration, values: s.values, bound: low(s.bound) };
    });
    var effect = (styles.effectStyles || []).filter(function (s) { return s && s.effects; }).map(function (s) {
      return { name: s.name, description: s.description || '',
               effects: s.effects.map(function (e) {
                 var o = {}; Object.keys(e).forEach(function (k) { o[k] = k === 'bound' ? low(e.bound) : e[k]; });
                 return o;
               }) };
    });
    var grid = (styles.gridStyles || []).filter(function (s) { return s && s.layoutGrids; }).map(function (s) {
      return { name: s.name, description: s.description || '',
               layoutGrids: s.layoutGrids.map(function (g) {
                 var o = {}; Object.keys(g).forEach(function (k) { o[k] = k === 'bound' ? low(g.bound) : g[k]; });
                 return o;
               }) };
    });
    if (!text.length && !effect.length && !grid.length) return null;
    var out = {};
    if (text.length) out.text = text;
    if (effect.length) out.effect = effect;
    if (grid.length) out.grid = grid;
    return out;
  }

  /*
    THE STRUCTURE RECORD: the whole variable graph (src/structure-graph.js) and the styles in the
    file's own spelling, under restore.structure. Written for EVERY shape — the house layout and the
    derived one alike — because it is what lets the import rebuild a layering it has no rules for. A
    derived document has no root metadata of its own, so one is made for it, carrying only this.
  */
  function attachStructure(res, collections, styles) {
    if (!SG || !res.document) return;
    var rec = SG.encode(collections);
    var st = restoreStyles(styles, true);
    if (st) rec.styles = st;
    var ext = res.document.$extensions;
    if (!ext || typeof ext !== 'object') { ext = {}; res.document.$extensions = ext; }
    var meta = ext[FOUNDATION_NS];
    if (!meta || typeof meta !== 'object') { meta = {}; ext[FOUNDATION_NS] = meta; }
    if (!meta.restore) meta.restore = {};
    meta.restore.structure = rec;
  }

  function document(collections, options) {
    var res = documentRaw(collections, options);
    if (!options || options.keepLegacyExtension !== true) stripLegacyExtension(res.document);
    if (options && options.lowercase === false) return res;
    var lc = lowercaseDocument(res.document);
    res.document = lc.document;
    res.lowercaseCollisions = lc.collisions;
    /* Last, and only on request: the section describes the document as it is
       NOW — lowercased, legacy stamp gone — so its paths are the real ones. */
    if (options && options.restore && res.shape === 'house') {
      var ext = res.document.$extensions && res.document.$extensions[FOUNDATION_NS];
      var rootName = Object.keys(res.document).filter(function (k) {
        return k.charAt(0) !== '$' && ['core', 'breakpoint', 'mode'].indexOf(k) === -1;
      })[0];
      var section = ext && rootName ? buildRestore(collections, res.document, rootName, options.styles) : null;
      if (section) ext.restore = section;
    }
    if (options && options.restore) attachStructure(res, collections, options.styles);
    return res;
  }

  var api = {
    emit: emit,
    document: document,
    lowercaseDocument: lowercaseDocument,
    deriveTypes: deriveTypes,
    commonPrefix: commonPrefix,
    groupBranches: groupBranches,
    restoreHops: restoreHops,
    restoreDescriptions: restoreDescriptions,
    restoreCoreScopes: restoreCoreScopes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomEmitResolved = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
