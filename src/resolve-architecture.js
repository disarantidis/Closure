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

  var api = {
    buildIndex: buildIndex,
    classify: classify,
    resolve: resolve,
    enumerate: enumerate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomArchitecture = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
