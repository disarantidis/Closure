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
    var hint = options.typeHints || function () { return null; };
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

    // --- the document a consumer reads --------------------------------------

  function document(collections, options) {
    options = options || {};
    var hooks = options.hooks || {};

    var res = emit(collections, {
      hooks: hooks,
      pin: options.pin,
      renameMode: options.renameMode || function (axis, mode) { return slugModeName(mode); },
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
          return {
            document: lastHouse.document, shape: 'house', roles: roles,
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
            renameMode: options.renameMode || function (axis, mode) { return slugModeName(mode); },
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
          renameMode: options.renameMode || function (axis, mode) { return slugModeName(mode); },
          renameToken: options.renameToken,
          typeHints: options.typeHints
        });
        roles = detectLayoutRoles(current) || roles;
      }

      return {
        document: shapeDerived(res),
        shape: 'derived',
        roles: options.axes,
        total: derivedTotal,
        layoutCollisions: lastHouse ? lastHouse.collisions.length : 0,
        unplacedAxes: lastHouse ? lastHouse.culprits : [],
        emit: res
      };
    }

    return { document: shapeDerived(res), shape: 'derived', roles: null, total: derivedTotal, emit: res };
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
    Object.keys(res.primitives).forEach(function (name) {
      out[name.replace(/^[._]+/, '')] = res.primitives[name];
    });
    Object.keys(res.groups).forEach(function (key) {
      var g = res.groups[key];
      var section = g.axes.length
        ? g.axes.map(function (a) { return a.replace(/^[._]+/, ''); }).join('-')
        : 'static';
      var node = out[section] = out[section] || {};
      g.branches.forEach(function (b) {
        var here = node;
        b.path.forEach(function (seg) { here = here[seg] = here[seg] || {}; });
        mergeResolvedInto(here, b.tokens);
      });
    });
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

    Object.keys(res.groups).forEach(function (key) {
      res.groups[key].branches.forEach(function (br) {
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
          out.mode[mm][leaf] = mergeResolvedInto(out.mode[mm][leaf] || {}, br.tokens);
        });
      });
    });
    return { document: out, collisions: collisions, culprits: Object.keys(culprits) };
  }

  var api = {
    emit: emit,
    document: document,
    deriveTypes: deriveTypes,
    commonPrefix: commonPrefix,
    groupBranches: groupBranches
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomEmitResolved = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
