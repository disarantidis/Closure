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

  function dotted(name) { return name.split('/').join('.'); }

  function setDeep(root, path, value) {
    var parts = path.split('/');
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
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

  function typeFromScopes(v) {
    var scopes = v.scopes || [];
    for (var i = 0; i < scopes.length; i++) {
      if (SCOPE_TYPE[scopes[i]]) return SCOPE_TYPE[scopes[i]];
    }
    return null;
  }

  function typeFromResolved(resolvedType) {
    if (resolvedType === 'COLOR') return 'color';
    if (resolvedType === 'STRING') return 'text';
    return 'number';
  }

  /*
    A type for every variable, in descending order of how much the file itself
    states it:

      1  its own narrowing scope
      2  a caller hint, for the names a file uses that its metadata does not
      3  what its consumers resolved to — a primitive reached only by tokens
         scoped CORNER_RADIUS is a radius, and the graph says so
      4  its Figma type

    Step 3 is why the primitive collection does not need a name table: the
    consumption layer is where scopes are set, and the alias edges carry that
    downwards. Where consumers disagree the majority wins, ties by name so a
    rerun agrees with itself.
  */
  function deriveTypes(index, plans, options) {
    var hint = options.typeHints || function () { return null; };
    var byId = {};
    var votes = {};

    Object.keys(index.varsById).forEach(function (id) {
      var v = index.varsById[id];
      var t = typeFromScopes(v) || hint(v.name, v.type, v);
      if (t) byId[id] = t;
    });

    plans.forEach(function (plan) {
      var t = byId[plan.variable.id];
      if (!t) return;
      Object.keys(plan.branches).forEach(function (key) {
        var terminal = plan.branches[key].terminal;
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

    return function typeOf(v) {
      return byId[v.id] || hint(v.name, v.type, v) || typeFromResolved(v.type);
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
    var renameMode = options.renameMode || function (axis, mode) { return mode; };

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
        setDeep(tree, v.name, { value: fmt(v.valuesByMode[modeId]), type: typeOf(v) });
      });
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
      var prefix = commonPrefix(members.map(function (p) { return p.variable.name; }));
      var rename = options.renameToken || function (name) { return stripPrefix(name, prefix); };
      var vectors = groupBranches(members, order);
      if (!vectors.length) vectors = [{}];

      var branches = vectors.map(function (vec) {
        var full = {};
        Object.keys(pin).forEach(function (k) { full[k] = pin[k]; });
        Object.keys(vec).forEach(function (k) { full[k] = vec[k]; });

        var tree = {};
        members.forEach(function (plan) {
          var nm = rename(plan.variable.name, key, prefix);
          setDeep(tree, nm, {
            value: refOrValue(plan.variable, full),
            type: typeOf(plan.variable)
          });
        });

        return {
          path: order.filter(function (n) { return vec[n] !== undefined; })
                     .map(function (n) { return renameMode(n, vec[n]); }),
          vector: vec,
          dependsOn: order.filter(function (n) { return vec[n] !== undefined; }),
          tokens: tree
        };
      });

      groups[key] = {
        axes: members[0].signature.slice(),
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
              // textCase/textDecoration ride inside the composite's $extensions
              // in this shape rather than as tokens of their own.
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
    Object.keys(groups).forEach(function (key) {
      groups[key].branches.forEach(function (branch) {
        branch.tokens = convert(branch.tokens);
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

  var api = {
    emit: emit,
    deriveTypes: deriveTypes,
    commonPrefix: commonPrefix,
    groupBranches: groupBranches
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomEmitResolved = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
