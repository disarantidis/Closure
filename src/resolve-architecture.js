/*
 * resolve-architecture.js — resolve a Figma variable graph under a mode vector.
 *
 * WHAT THIS IS FOR. code.js's extraction already walks alias chains, but it
 * collapses every hop to the target's FIRST mode ("use first available mode
 * since primitive vars typically have one mode" — code.js). That assumption
 * holds for a single-mode primitives collection and breaks for every
 * multi-mode collection in a routed architecture: a chain that passes through
 * a 6-mode scheme router and a 2-mode light/dark switch can only ever come
 * back as "first scheme, light". Every other combination is unreachable.
 *
 * THE FIX IS A MODE VECTOR — the same thing Figma itself does at render time.
 * Resolution carries which mode is active in EVERY collection at once:
 *
 *   { '.scheme': 'brand', '.mode': 'dark', '_restricted': 'unrestricted' }
 *
 * At each hop the resolver reads the target variable's value for whichever
 * mode that vector selects in the TARGET's own collection, falling back to
 * that collection's default mode when the vector says nothing about it (which
 * is what a single-mode collection always wants).
 *
 * IT KNOWS NOTHING ABOUT ANY PARTICULAR ARCHITECTURE. There is no notion here
 * of schemes, modes, restrictions or leaves — it follows whatever aliases the
 * file actually has, however deep, whatever they skip. A file whose brand
 * scheme bypasses the light/dark switch resolves correctly without being told
 * that it does; so does one where it doesn't.
 *
 * AND IT RECORDS WHAT IT VISITED, which is what makes enumeration tractable.
 * A naive product of every axis is mostly duplicates: with a 6-mode router and
 * a 15-mode palette collection, 90 combinations collapse to 20 real ones,
 * because the 15 palettes only matter when the router actually routes into
 * them. Rather than encode that rule, `visited` reports which collections a
 * resolution really passed through, and enumerate() folds away any axis a
 * given combination never touched. The dependency structure is measured, not
 * declared.
 */
(function (global) {
  'use strict';

  // --- index -----------------------------------------------------------------

  /*
    Flattens the extraction (an array of collections, each carrying its own
    variables) into the lookups resolution needs: variables by id, collections
    by id and by name, and which collection each variable belongs to — the
    extraction nests that rather than storing it on the variable.
  */
  function buildIndex(collections) {
    var varsById = {};
    var collsById = {};
    var collsByName = {};
    var collectionOfVar = {};

    collections.forEach(function (c) {
      collsById[c.id] = c;
      collsByName[c.name] = c;
      (c.variables || []).forEach(function (v) {
        varsById[v.id] = v;
        collectionOfVar[v.id] = c;
      });
    });

    return {
      collections: collections,
      varsById: varsById,
      collsById: collsById,
      collsByName: collsByName,
      collectionOfVar: collectionOfVar
    };
  }

  function isAlias(value) {
    return !!value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS';
  }

  function modeIdFor(collection, vector) {
    var wanted = vector ? vector[collection.name] : undefined;
    if (wanted) {
      for (var i = 0; i < collection.modes.length; i++) {
        // a vector may name a mode by name or by id — accept either
        if (collection.modes[i].name === wanted || collection.modes[i].modeId === wanted) {
          return collection.modes[i].modeId;
        }
      }
    }
    // No opinion from the vector (or a mode name this collection doesn't have):
    // its own default. For a single-mode collection that IS the only answer.
    return collection.defaultModeId !== undefined
      ? collection.defaultModeId
      : (collection.modes[0] || {}).modeId;
  }

  // --- resolution ------------------------------------------------------------

  /*
    Walk from `variable` to a raw value under `vector`.

    Returns { value, visited, error } — `visited` is every collection the walk
    passed through, in order, and is what enumerate() uses to tell which axes
    actually mattered. `error` is set (and value null) for a cycle, a dangling
    or external alias target, or a chain longer than maxHops; the caller
    decides what to do about it rather than getting a silently wrong value.
  */
  function resolve(index, variable, vector, options) {
    var maxHops = (options && options.maxHops) || 24;
    var visited = [];
    var seen = {};
    var v = variable;

    for (var hop = 0; hop < maxHops; hop++) {
      if (!v) return { value: null, visited: visited, error: 'missing-variable' };
      if (seen[v.id]) return { value: null, visited: visited, error: 'cycle' };
      seen[v.id] = true;

      var collection = index.collectionOfVar[v.id];
      if (!collection) return { value: null, visited: visited, error: 'orphan-variable' };
      if (visited.indexOf(collection.name) === -1) visited.push(collection.name);

      var value = (v.valuesByMode || {})[modeIdFor(collection, vector)];
      if (!isAlias(value)) {
        return { value: value === undefined ? null : value, visited: visited };
      }

      var next = index.varsById[value.id];
      if (!next) {
        // Published from another library — its value isn't in this extraction.
        return { value: null, visited: visited, error: 'external-alias' };
      }
      v = next;
    }

    return { value: null, visited: visited, error: 'max-hops' };
  }

  // --- classification --------------------------------------------------------

  /*
    Roles read straight off the collection-level alias graph, so nothing here
    is configured per file:

      in-degree 0   nothing aliases INTO it — it's what components consume
      out-degree 0  it aliases nowhere — it holds the raw values
      otherwise     routing in between

    `axes` is every collection with more than one mode: those are exactly the
    choices a consumer can make, and therefore the candidate output branches.
  */
  function classify(collections) {
    var index = buildIndex(collections);
    var inDeg = {};
    var outDeg = {};

    collections.forEach(function (c) { inDeg[c.name] = 0; outDeg[c.name] = 0; });

    collections.forEach(function (c) {
      (c.variables || []).forEach(function (v) {
        Object.keys(v.valuesByMode || {}).forEach(function (modeId) {
          var value = v.valuesByMode[modeId];
          if (!isAlias(value)) return;
          var target = index.collectionOfVar[value.id];
          if (!target || target.name === c.name) return;
          outDeg[c.name]++;
          inDeg[target.name]++;
        });
      });
    });

    var consumption = [];
    var primitive = [];
    var intermediate = [];

    collections.forEach(function (c) {
      if (inDeg[c.name] === 0) consumption.push(c.name);
      else if (outDeg[c.name] === 0) primitive.push(c.name);
      else intermediate.push(c.name);
    });

    var axes = collections
      .filter(function (c) { return c.modes && c.modes.length > 1; })
      .map(function (c) {
        return { name: c.name, modes: c.modes.map(function (m) { return m.name; }) };
      });

    return {
      consumption: consumption,
      primitive: primitive,
      intermediate: intermediate,
      axes: axes,
      inDegree: inDeg,
      outDegree: outDeg
    };
  }

  // --- enumeration -----------------------------------------------------------

  function cartesian(axes) {
    var out = [{}];
    axes.forEach(function (axis) {
      var next = [];
      out.forEach(function (base) {
        axis.modes.forEach(function (mode) {
          var copy = {};
          Object.keys(base).forEach(function (k) { copy[k] = base[k]; });
          copy[axis.name] = mode;
          next.push(copy);
        });
      });
      out = next;
    });
    return out;
  }

  /*
    Resolve one variable across every combination of `axes`, then fold away the
    axes a given combination never actually reached.

    The key is `visited`: two vectors that differ only in a collection the walk
    never entered cannot produce different values, so they are one branch. The
    branch key spells that out — an axis the walk skipped is written '*', which
    is both the dedupe key and a readable statement of what the value does NOT
    depend on. That is where "which schemes ignore light/dark" comes from: it
    is observed per token, not declared once per file.
  */
  function enumerate(index, variable, axes, options) {
    var vectors = cartesian(axes);
    var branches = {};
    var axisNames = axes.map(function (a) { return a.name; });

    vectors.forEach(function (vector) {
      var result = resolve(index, variable, vector, options);
      var key = axisNames.map(function (name) {
        return name + '=' + (result.visited.indexOf(name) !== -1 ? vector[name] : '*');
      }).join(',');

      if (!branches[key]) {
        branches[key] = {
          key: key,
          vector: vector,
          dependsOn: axisNames.filter(function (n) { return result.visited.indexOf(n) !== -1; }),
          visited: result.visited,
          value: result.value,
          error: result.error
        };
      }
    });

    return {
      combinationsEvaluated: vectors.length,
      branches: branches,
      branchCount: Object.keys(branches).length
    };
  }

  /*
    The same answer as enumerate(), reached by exploring only what's reachable.

    enumerate() evaluates the whole product and folds afterwards, which is fine
    for one token and wasteful for a file: five axes of 6/2/4/15/5 is 3,600
    vectors per token, nearly all of them collapsing into each other.

    This instead grows the vector as the walk demands it. Resolve with what is
    fixed so far; if the walk entered an axis nobody has pinned yet, that is
    precisely the decision that matters here, so branch on that axis's modes
    and recurse. Re-resolving after each choice is what keeps it correct when
    the choice changes the route — picking a scheme that bypasses the light/dark
    switch simply never asks the light/dark question, and picking one that
    routes into a palette collection then asks which palette.

    So the recursion walks the real dependency tree and lands on exactly the
    branches enumerate() would have folded to: 22 for a token whose product is
    180, reached in ~22 resolutions instead of 180.

    `pin` pre-seeds the vector for axes that should not become branches at all
    (a permission layer you only want the unrestricted reading of, say).
  */
  function enumerateAdaptive(index, variable, axes, options) {
    options = options || {};
    var axisByName = {};
    axes.forEach(function (a) { axisByName[a.name] = a; });

    var branches = {};
    var resolutions = 0;

    function explore(vector) {
      var result = resolve(index, variable, vector, options);
      resolutions++;

      // An axis the walk entered that nothing has decided yet is the next question.
      var open = null;
      for (var i = 0; i < result.visited.length; i++) {
        var name = result.visited[i];
        if (axisByName[name] && vector[name] === undefined) { open = axisByName[name]; break; }
      }

      if (!open) {
        var fixed = Object.keys(vector).filter(function (n) { return result.visited.indexOf(n) !== -1; });
        var key = axes.map(function (a) {
          return a.name + '=' + (fixed.indexOf(a.name) !== -1 ? vector[a.name] : '*');
        }).join(',');
        if (!branches[key]) {
          branches[key] = {
            key: key,
            vector: vector,
            dependsOn: fixed,
            visited: result.visited,
            value: result.value,
            error: result.error
          };
        }
        return;
      }

      open.modes.forEach(function (mode) {
        var next = {};
        Object.keys(vector).forEach(function (k) { next[k] = vector[k]; });
        next[open.name] = mode;
        explore(next);
      });
    }

    var seed = {};
    if (options.pin) {
      Object.keys(options.pin).forEach(function (k) { seed[k] = options.pin[k]; });
    }
    explore(seed);

    return {
      resolutions: resolutions,
      branches: branches,
      branchCount: Object.keys(branches).length
    };
  }

  // --- emitting a resolved tree ----------------------------------------------

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
    Which output branches to emit: the product of the axes being pivoted, with
    `pin` holding any axis at one mode so it never becomes a branch at all.

    Unlike enumerateAdaptive's per-token folding, this is deliberately the full
    product: the branches are the OUTPUT's shape, and that has to be uniform
    across tokens — one token ignoring the light/dark axis can't be allowed to
    delete `dark` from a document other tokens need. Per-token dependencies
    still show up, in each branch's `dependsOn`, which is what tells a caller
    that two branches carry identical values and could be collapsed by a
    shaping step that wants RADD's 20 schemes rather than 6x15.
  */
  function branchVectors(axes, options) {
    options = options || {};
    var pin = options.pin || {};
    var pivot = axes.filter(function (a) { return pin[a.name] === undefined; });
    if (options.pivot) {
      pivot = pivot.filter(function (a) { return options.pivot.indexOf(a.name) !== -1; });
    }
    return cartesian(pivot).map(function (vector) {
      var full = {};
      Object.keys(pin).forEach(function (k) { full[k] = pin[k]; });
      Object.keys(vector).forEach(function (k) { full[k] = vector[k]; });
      return {
        key: pivot.map(function (a) { return a.name + '=' + vector[a.name]; }).join(','),
        vector: full
      };
    });
  }

  /*
    Resolve every token in the consumption layer under every output branch.

    `roots` defaults to the collections classify() found nothing aliasing into
    — the consumption layer — because those are the only ones a component ever
    references; the routing collections exist to be walked THROUGH, and
    emitting them would re-export the plumbing this is supposed to resolve away.

    Values come back raw (Figma's own {r,g,b,a} objects, numbers, strings).
    Shaping them into DTCG composites is dtcg-format.js's job, not this one —
    keeping the two apart is what lets this resolve a graph without owning an
    output format.
  */
  function buildResolvedTree(collections, options) {
    options = options || {};
    var index = buildIndex(collections);
    var cls = classify(collections);
    var roots = options.roots || cls.consumption;
    var vectors = branchVectors(cls.axes, options);

    var branches = {};
    var stats = { tokens: 0, resolutions: 0, errors: 0 };

    vectors.forEach(function (branch) {
      var tree = {};
      roots.forEach(function (collName) {
        var coll = index.collsByName[collName];
        if (!coll) return;
        (coll.variables || []).forEach(function (v) {
          var result = resolve(index, v, branch.vector, options);
          stats.resolutions++;
          if (result.error) stats.errors++;
          setDeep(tree, v.name, {
            value: result.value,
            type: v.type,
            description: v.description || undefined,
            error: result.error
          });
        });
      });
      branches[branch.key] = { vector: branch.vector, tokens: tree };
    });

    stats.tokens = roots.reduce(function (n, name) {
      var c = index.collsByName[name];
      return n + ((c && c.variables) ? c.variables.length : 0);
    }, 0);

    return {
      classification: cls,
      roots: roots,
      branchCount: vectors.length,
      branches: branches,
      stats: stats
    };
  }

  var api = {
    buildIndex: buildIndex,
    classify: classify,
    resolve: resolve,
    enumerate: enumerate,
    enumerateAdaptive: enumerateAdaptive,
    branchVectors: branchVectors,
    buildResolvedTree: buildResolvedTree
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomArchitecture = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
