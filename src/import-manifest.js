/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  $figmaStructure — the export declaring the architecture it came out of, so
  the import does not have to infer it back.

  WHY A DECLARATION BEATS THE MEASUREMENT, even a measurement that works.
  derive()'s path-overlap rule recovers the right shape from a real export and
  refuses honestly when it cannot. But it can only ever recover the SHAPE. It
  cannot recover a NAME the export threw away, and it is inference where the
  exporter had certainty: at export time we are reading the collections
  straight out of Figma and know, with no doubt at all, that ".white" is its
  own collection and that its mode is called ".white". Writing that down costs
  one small object and removes a whole class of question.

  WHAT IT FIXES CONCRETELY. Round-tripping a real file without it produced:

      .core        -> core             the leading dot, gone
      _restricted  -> restrictions     renamed by the exporter's own rules
      .breakpoint  -> breakpoint       and "S Mobile" -> "mobile"

  Every one of those is the exporter's spelling, not the file's, and no
  derivation can undo them — the information is simply not in the JSON. With
  the manifest it is, and the import reproduces the original names.

  IT IS A HINT, NOT A CONTRACT. A manifest that does not match the document it
  arrives in (sets added, renamed, hand-edited) is IGNORED rather than trusted,
  and the derivation runs as if it were absent. A stale declaration that
  overrides a live measurement would be worse than no declaration at all.
*/

/* Figma collection names carry prefixes the export strips — ".core" becomes
   "core", "_restricted" becomes "restrictions". Matching is done on a
   normalised form so a manifest still binds to the sets the exporter wrote. */
function norm(s) {
  return String(s).replace(/^[._]+/, '').toLowerCase().replace(/[\s_-]+/g, '');
}

/*
  EXPORT SIDE. Built from the raw variable graph, which is the only place the
  truth exists — by the time the token tree is assembled the names have already
  been rewritten.
*/
function buildManifest(rawCollections) {
  if (!rawCollections || !rawCollections.length) return null;
  return {
    version: 1,
    collections: rawCollections.map(function (c) {
      return {
        figmaName: c.name,
        modes: (c.modes || []).map(function (m) { return m.name; }),
        variables: (c.variables || []).length,
      };
    }),
  };
}

/*
  ── $themes IS ALREADY AN ARCHITECTURE ─────────────────────────────────────

  Every Tokens Studio document carries one, and it says more than the set
  names ever could:

      { "name": "light", "group": ".mode",
        "selectedTokenSets": { "mode/light": "enabled",
                               "restrictions/unrestricted": "source" } }

      group   the Figma COLLECTION, under its real name - dots and all
      name    the MODE within it
      enabled the sets that collection owns; `source` is a dependency it
              merely reads, and belongs to somebody else

  A theme with no group is a collection of its own with a single mode, named
  after the theme.

  WHY THIS OUTRANKS EVERYTHING ELSE HERE. It is a declaration rather than an
  inference, it is present on every Tokens Studio export rather than only on
  ones this plugin wrote, and it carries names nothing else can reach: the
  ".breakpoint" collection declares its modes as "S Mobile" and "M Tablet",
  while the SET names had already flattened those to "mobile" and "tablet".
  Measured against the file it came from, 10 of the 12 collections it declares
  match Figma exactly, mode names included.

  IT IS NOT COMPLETE, AND MUST NOT PRETEND TO BE. In that same document eight
  sets are enabled by no theme at all, and three of Figma's collections are
  never mentioned. So this binds what it covers and says nothing about the
  rest, which then falls through to being measured like any other document.
*/
function bindThemes(ir) {
  const themes = ir && ir.themes;
  if (!Array.isArray(themes) || !themes.length) return null;

  const collections = new Map();      // collection -> modes, in declaration order
  const setMap = new Map();           // set name -> { collection, mode }

  for (const t of themes) {
    if (!t || !t.name) continue;
    const collection = t.group || t.name;
    if (!collections.has(collection)) collections.set(collection, []);
    const modes = collections.get(collection);
    if (modes.indexOf(t.name) === -1) modes.push(t.name);

    const sets = t.selectedTokenSets || {};
    for (const set of Object.keys(sets)) {
      /* `enabled` is ownership; `source` is a set this theme READS and
         another one owns. Treating source as ownership would hand the same
         set to every theme that depends on it. */
      if (sets[set] !== 'enabled') continue;
      if (setMap.has(set)) continue;                  // first claim wins
      setMap.set(set, { collection, mode: t.name });
    }
  }

  if (!setMap.size) return null;
  const covered = new Set([...setMap.keys()]);
  const all = (ir.sets || []).filter((x) => x);

  /*
    WHICH COLLECTION A FORGOTTEN SET BELONGS TO.

    A theme list can be incomplete — eight of forty-six sets in the document
    this was built against are enabled by no theme at all. Left alone,
    "scheme/magenta" becomes a collection named `scheme` sitting beside the
    declared `.scheme`, and then every path they share is a reference
    collision: the same token defined twice, and the import stops.

    But its set name says exactly where it belongs. The sets a collection DOES
    own share a prefix, so the prefix identifies the collection, and the set's
    own variant is the mode the theme list forgot to declare. That is reading
    the declaration further, not guessing past it.
  */
  const groupOfCollection = new Map();
  for (const [set, where] of setMap) {
    const i = set.indexOf('/');
    if (i === -1) continue;
    const g = norm(set.slice(0, i));
    if (!groupOfCollection.has(g)) groupOfCollection.set(g, where.collection);
    else if (groupOfCollection.get(g) !== where.collection) groupOfCollection.set(g, null); // ambiguous
  }

  return {
    collections, setMap, groupOfCollection,
    covered: covered.size,
    uncovered: all.filter((x) => !covered.has(x)),
  };
}

/*
  IMPORT SIDE. Bind each of the IR's groups to a manifest collection.

  A group binds one of two ways, and which one IS the verdict — no measuring
  needed:

    'modes'     one collection whose mode names are this group's variants
                (mode/light + mode/dark  ->  ".mode" [light, dark])

    'separate'  one collection PER variant, each a single-mode collection whose
                name matches that variant
                (base/white + base/black  ->  ".white", ".black")

  Anything that does not bind cleanly returns null for that group and the
  caller falls back to measuring it. Partial binding is fine and expected: a
  hand-added set should not invalidate the declaration for everything else.
*/
function bindManifest(ir, manifest) {
  if (!manifest || !manifest.collections || !manifest.collections.length) return null;

  const cols = manifest.collections;
  const byNorm = new Map();
  for (const c of cols) {
    const k = norm(c.figmaName);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(c);
  }

  const groups = new Map();                     // group -> variants in order
  for (const r of ir.rows) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    const v = groups.get(r.group);
    if (v.indexOf(r.variant) === -1) v.push(r.variant);
  }

  const bindings = new Map();                   // group -> binding
  let bound = 0, unbound = 0;

  const sig = (names) => names.map(norm).sort().join('\u0000');
  const used = new Set();

  for (const [group, variants] of groups) {
    const want = sig(variants);
    const byName = byNorm.get(norm(group)) || [];

    /* 1. NAME AND MODES BOTH AGREE — the unambiguous case. Modes compared as a
          set, since their order carries no meaning. */
    let asModes = byName.filter((c) => sig(c.modes) === want)[0];
    let how = 'name and modes';

    /* 2. MODES AGREE, NAME DOES NOT. The exporter renames collections as well
          as stripping their prefixes (_restricted -> restrictions), so the
          name is the less reliable half of the pair. A mode-set that matches
          exactly ONE unclaimed collection identifies it on its own; if two
          could match, it identifies nothing and this stays unbound. */
    if (!asModes) {
      const bySig = cols.filter((c) => !used.has(c) && sig(c.modes) === want);
      if (bySig.length === 1) { asModes = bySig[0]; how = 'modes'; }
    }

    /* 3. NAME AGREES AND THE COUNT DOES, BUT THE MODE NAMES DO NOT — the
          exporter rewrites those too (".breakpoint"'s "S Mobile" -> "mobile").
          Bound positionally, because the sets are written in the collection's
          own mode order. Weaker than the two above, so it is recorded as such
          and a caller can tell the difference. */
    let positional = false;
    if (!asModes) {
      const byCount = byName.filter((c) => !used.has(c) && c.modes.length === variants.length)[0];
      if (byCount) { asModes = byCount; how = 'name and mode count (positional)'; positional = true; }
    }

    if (asModes) {
      used.add(asModes);
      const modeName = {};
      variants.forEach(function (v, i) {
        modeName[v] = positional
          ? asModes.modes[i]
          : (asModes.modes.filter((m) => norm(m) === norm(v))[0] || v);
      });
      bindings.set(group, { verdict: 'modes', collection: asModes.figmaName, modeName, how });
      bound++;
      continue;
    }

    /* 'separate': every variant is its own single-mode collection. */
    const per = {};
    const claimed = [];
    let all = true;
    for (const v of variants) {
      const c = (byNorm.get(norm(v)) || []).filter((x) => !used.has(x) && x.modes.length === 1)[0];
      if (!c) { all = false; break; }
      per[v] = { collection: c.figmaName, mode: c.modes[0] };
      claimed.push(c);
    }
    if (all && variants.length) {
      claimed.forEach((c) => used.add(c));
      bindings.set(group, { verdict: 'separate', per, how: 'one single-mode collection per variant' });
      bound++;
      continue;
    }

    unbound++;
  }

  if (!bound) return null;                      // nothing matched: treat as absent
  return { bindings, bound, unbound, collections: cols.length };
}

  var api = { buildManifest, bindManifest, bindThemes, norm };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportManifest = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
