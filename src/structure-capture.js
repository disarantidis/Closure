/*
  Dual-mode, exactly like src/resolve-architecture.js and src/component-capture.js:
  module.exports when there is a require(), a global otherwise. One file runs in
  Node (the self-test), in the plugin sandbox (code.js) and nowhere else needs it.

  CAPTURE THE STRUCTURE OF THE VARIABLES IN THIS FILE.

  A token file is more than its values. It is a set of collections, the modes
  each one has, and the routes between them: which collection a variable points
  into, and what its name becomes on the way. src/architecture-radd.js holds
  that knowledge for one architecture, written by hand. This module reads it
  off the file instead, so any file with any layering can be described the same
  way — and so a person can ask for it, deliberately, with a button.

  IT KNOWS NOTHING ABOUT ANY PARTICULAR ARCHITECTURE. No collection name is
  mentioned below. The order of the layers comes from the alias edges, the
  routes from how a name changes across an edge. Run on a file with another
  layering it describes that one.

  WHAT IT TAKES: the same raw graph the rest of the plugin reads —
    [{ id, name, modes:[{modeId,name}], hiddenFromPublishing,
       variables:[{ id, name, resolvedType, valuesByMode }] }]
  WHAT IT GIVES: plain data, safe to JSON.stringify.

  A BINDING is an alias that lands in a terminal collection (one that points nowhere
  itself: the primitives), or whose two names share no tail: one variable pointing at one
  other, with nothing carried across. They are counted per pair of collections and
  not listed — there is one per variable, and they say what a value IS, not how
  the layers connect.

  A ROUTE (a "rule") is read from a single alias: variable `scheme/basic/text`
  in collection `.scheme`, mode `neutral`, points at `restrictions/neutral/basic/text`
  in `_restricted`. The two names share a tail (`basic/text`); what is in front
  of it is the part the route rewrites. Rules are counted over every alias with
  the same (collection, front, mode) → (collection, front), so a rule that holds
  for 179 variables says 179, and an odd one out says 1.

  KNOWN LIMIT. The tail is the longest run of trailing name segments the two
  names share. When a rewritten front happens to repeat the first segment of
  the tail the cut falls one segment further in, and that alias is counted
  under a longer tail — correct, but a separate rule. `routes` reports every
  rule with its count so such a split is visible rather than hidden.
*/
(function (global) {
  'use strict';

  var FORMAT = 'radd-structure';
  var VERSION = 3;

  function isAlias(v) {
    return !!v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS' && typeof v.id === 'string';
  }

  function inc(map, key, by) {
    map[key] = (map[key] || 0) + (by === undefined ? 1 : by);
  }

  /* How many trailing segments two names share, leaving each at least one
     segment in front — a name never routes to its own tail. */
  function sharedTail(a, b) {
    var max = Math.min(a.length, b.length) - 1;
    var k = 0;
    while (k < max && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
    return k;
  }

  function sortedKeys(o) {
    return Object.keys(o).sort();
  }

  function capture(collections, options) {
    var opts = options || {};
    var byVar = {};
    var collOfVar = {};
    var modeName = {};

    collections.forEach(function (c) {
      modeName[c.id] = {};
      (c.modes || []).forEach(function (m) { modeName[c.id][m.modeId] = m.name; });
      (c.variables || []).forEach(function (v) {
        byVar[v.id] = v;
        collOfVar[v.id] = c;
      });
    });

    /* A collection none of whose variables point anywhere is where values are
       CHOSEN (the primitives), not routed. Found first, because whether an alias
       is a route depends on what it lands in. */
    var terminal = {};
    collections.forEach(function (c) {
      var any = false;
      (c.variables || []).forEach(function (v) {
        var by = v.valuesByMode || {};
        Object.keys(by).forEach(function (mid) { if (isAlias(by[mid])) any = true; });
      });
      terminal[c.id] = !any;
    });

    var edgeCount = {};          // "from\u0001to" -> aliases
    var ruleCount = {};          // "from\u0001front\u0001to\u0001front" -> { modes:{mode:n}, n }
    var bindingCount = {};       // "from\u0001to" -> aliases that share no tail: a pointer, not a route
    var external = 0;
    var perCollection = [];

    collections.forEach(function (c) {
      var types = {}, groups = {}, aliases = 0, literals = 0;
      (c.variables || []).forEach(function (v) {
        inc(types, v.resolvedType || 'UNKNOWN');
        inc(groups, String(v.name).split('/')[0]);
        var by = v.valuesByMode || {};
        Object.keys(by).forEach(function (mid) {
          var val = by[mid];
          if (isAlias(val)) {
            aliases++;
            var t = byVar[val.id];
            if (!t) { external++; return; }
            var to = collOfVar[val.id];
            if (to.id !== c.id) inc(edgeCount, c.name + '\u0001' + to.name);
            var S = String(v.name).split('/');
            var T = String(t.name).split('/');
            var k = sharedTail(S, T);
            /* No shared tail: the name is not carried across, so this is one variable
               pointing at one other (a palette entry at its primitive). Counting it as a
               route would make a route per variable — measured on a real file: 6,840 of
               6,934. It is kept as a count per pair of collections. */
            /* The same when the target is a terminal collection: two names there
               that end alike (…/neutral-shades/50 → …/light/50) are a coincidence of
               step numbers, not a route. Measured: 71 of 148 routes were this. */
            if (k === 0 || terminal[to.id]) { inc(bindingCount, c.name + '\u0001' + to.name); return; }
            var key = c.name + '\u0001' + S.slice(0, S.length - k).join('/') + '\u0001' +
                      to.name + '\u0001' + T.slice(0, T.length - k).join('/');
            if (!ruleCount[key]) ruleCount[key] = { modes: {}, n: 0 };
            inc(ruleCount[key].modes, modeName[c.id][mid] || mid);
            ruleCount[key].n++;
          } else {
            literals++;
          }
        });
      });
      perCollection.push({
        name: c.name,
        modes: (c.modes || []).map(function (m) { return m.name; }),
        hidden: !!c.hiddenFromPublishing,
        extends: c.parentVariableCollectionId ? 'extension' : null,
        variables: (c.variables || []).length,
        aliases: aliases,
        literals: literals,
        types: types,
        groups: groups
      });
    });

    var edges = sortedKeys(edgeCount).map(function (k) {
      var p = k.split('\u0001');
      return { from: p[0], to: p[1], aliases: edgeCount[k] };
    });

    var bindings = sortedKeys(bindingCount).map(function (k) {
      var p = k.split('\u0001');
      return { from: p[0], to: p[1], aliases: bindingCount[k] };
    });

    var routes = sortedKeys(ruleCount).map(function (k) {
      var p = k.split('\u0001');
      var r = ruleCount[k];
      return {
        from: { collection: p[0], front: p[1] },
        to: { collection: p[2], front: p[3] },
        modes: sortedKeys(r.modes),
        aliases: r.n
      };
    });

    return {
      format: FORMAT,
      version: VERSION,
      file: opts.fileName || null,
      capturedAt: opts.capturedAt || null,
      layers: order(perCollection, edges),
      collections: perCollection,
      edges: edges,
      routes: routes,
      bindings: bindings,
      externalAliases: external,
      totals: {
        collections: perCollection.length,
        variables: perCollection.reduce(function (s, c) { return s + c.variables; }, 0),
        routes: routes.length,
        bindings: bindings.reduce(function (n, b) { return n + b.aliases; }, 0)
      }
    };
  }

  /*
    The layers, consumers first: a collection nothing else (still unplaced)
    points into goes before the ones it points at. A cycle, or a collection with
    no edges at all, falls back to the order Figma gave — the same rule
    clearOrder() in code.source.js uses, kept apart because that one takes
    Figma collections and this one takes data.
  */
  function order(perCollection, edges) {
    var left = perCollection.map(function (c) { return c.name; });
    var out = [];
    while (left.length) {
      var pick = -1;
      for (var i = 0; i < left.length && pick < 0; i++) {
        var pointedAt = false;
        for (var e = 0; e < edges.length; e++) {
          if (edges[e].to === left[i] && left.indexOf(edges[e].from) !== -1) pointedAt = true;
        }
        if (!pointedAt) pick = i;
      }
      if (pick < 0) pick = 0;
      out.push(left.splice(pick, 1)[0]);
    }
    return out;
  }

  /* The few lines the Settings card shows: what was found, in words. */
  function summarise(structure) {
    var layers = structure.layers.join(' → ');
    return {
      collections: structure.totals.collections,
      variables: structure.totals.variables,
      routes: structure.totals.routes,
      layers: layers
    };
  }

  /*
    WHICH SAVED STRUCTURE IS THIS DOCUMENT'S.

    Several files' structures can be saved on one computer, so the plugin has to
    tell them apart without being told. Three questions, asked in this order, each
    answering with the strongest evidence it has:

      same-file          the collection ids match. Ids belong to one file, so
                         this is that file and nothing else.
      same-architecture  not that file, but the same layering: the same
                         collections with the same modes, in the same order.
                         A copy of the file, or a sibling built the same way.
      similar            mostly the same collections and modes (share >= 0.8),
                         not all. The file has moved on from what was saved, or
                         is a near relative.
      new                nothing saved looks like it.

    The signature is made from names and modes only — never ids, never counts —
    so it survives a copy, a rename of a file, and variables coming and going.
    Plain data in, plain data out: what is saved and where is the sandbox's job.
  */
  function signature(structure) {
    var byName = {};
    structure.collections.forEach(function (c) { byName[c.name] = c; });
    var items = structure.layers.map(function (n) {
      var c = byName[n];
      return n + '[' + (c ? c.modes.join(',') : '') + ']';
    });
    var text = items.join('>');
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return { id: h.toString(36), items: items };
  }

  function similarity(a, b) {
    var inA = {}, union = {}, both = 0, i;
    for (i = 0; i < a.length; i++) { inA[a[i]] = 1; union[a[i]] = 1; }
    for (i = 0; i < b.length; i++) { if (inA[b[i]] === 1 && union[b[i]] === 1) both++; union[b[i]] = 2; }
    var all = Object.keys(union).length;
    return all === 0 ? 0 : both / all;
  }

  /* `entries` are what was saved: { key, sig, items, ... }. `current` is { key, sig, items }. */
  function match(entries, current) {
    var i, best = null, bestScore = 0;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].key === current.key) return { kind: 'same-file', entry: entries[i], score: 1 };
    }
    for (i = 0; i < entries.length; i++) {
      if (entries[i].sig === current.sig) return { kind: 'same-architecture', entry: entries[i], score: 1 };
    }
    for (i = 0; i < entries.length; i++) {
      var sc = similarity(entries[i].items || [], current.items || []);
      if (sc > bestScore) { bestScore = sc; best = entries[i]; }
    }
    if (best && bestScore >= 0.8) return { kind: 'similar', entry: best, score: bestScore };
    return { kind: 'new', entry: null, score: 0 };
  }

  var api = { capture: capture, summarise: summarise, signature: signature, similarity: similarity, match: match, FORMAT: FORMAT, VERSION: VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomStructureCapture = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
