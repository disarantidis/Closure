/*
  DERIVE — project an IR onto Figma's three structural slots, and report the
  projection rather than performing it.

  THIS MODULE WRITES NOTHING. It has no Figma dependency at all, which is what
  lets the hard part be tested against real exports without a document open and
  without any risk of half-applying a wrong answer.

  THE ONE DECISION THAT MATTERS is whether the variants of a group are MODES of
  one collection or SEPARATE collections that happen to share a name prefix.
  "mode/light" + "mode/dark" are the first; "base/white" + "base/black" are the
  second, and the two are indistinguishable by name. Getting it wrong does not
  throw — it produces a collection in which every variable is empty in all but
  one of its modes, which looks fine until someone tries to use it.

  So it is decided by measurement, not by naming: DO THE VARIANTS DEFINE THE
  SAME TOKEN PATHS? Alternative values for one thing are modes. Disjoint path
  sets are separate namespaces. On a real 31,959-token export this came out
  absolute — every group was either 100% or 0%, never in between.

  AND WHERE IT IS NOT ABSOLUTE, THE IMPORT STOPS. A group at 61% overlap is not
  a thing to guess at, because the wrong guess is silent. Ambiguity blocks and
  asks; it never picks the likelier reading.
*/

/* Above MODES_MIN the variants are read as modes, at or below SEPARATE_MAX as
   separate collections, and anything between is refused. The band is wide on
   purpose: real axes share ~all their paths and real namespaces share ~none, so
   a group landing in the middle means the file is not saying what we think it
   is — which is a reason to ask, not to round. */
const MODES_MIN = 0.9;
const SEPARATE_MAX = 0;

/* Figma has four variable types. Everything else is either one of these in
   disguise or not a variable at all. */
const FLOAT_TYPES = ['dimension', 'borderRadius', 'fontSizes', 'lineHeights', 'letterSpacing',
                     'number', 'spacing', 'sizing', 'borderWidth', 'opacity', 'paragraphSpacing',
                     'paragraphIndent', 'fontWeights.numeric'];
const STRING_TYPES = ['fontFamilies', 'fontWeights', 'textCase', 'textDecoration', 'string',
                      'asset', 'text', 'fontFamily', 'fontWeight'];
/* Not "unsupported" — NOT VARIABLES. A shadow or a type ramp is a Figma STYLE,
   a different API with a different shape. Reported as a loss for the variable
   importer and as the scope of a second one. */
const COMPOSITE_TYPES = ['typography', 'boxShadow', 'border', 'shadow', 'composition', 'gradient'];

function figmaType(t) {
  if (t == null) return null;
  if (t === 'color') return 'COLOR';
  if (t === 'boolean') return 'BOOLEAN';
  if (FLOAT_TYPES.indexOf(t) !== -1) return 'FLOAT';
  if (STRING_TYPES.indexOf(t) !== -1) return 'STRING';
  if (COMPOSITE_TYPES.indexOf(t) !== -1) return null;
  return 'STRING';
}
const isComposite = (t) => COMPOSITE_TYPES.indexOf(t) !== -1;

function derive(ir, opts) {
  opts = opts || {};
  const modeCeiling = opts.modeCeiling || Infinity;

  const plan = {
    source: ir.source,
    usedManifest: false,
    collections: [],
    ambiguous: [],
    blocked: [],
    losses: { composites: [], expressions: [], unresolvedRefs: [], typeConflicts: [], emptyCollections: [] },
    refCollisions: [],
    totals: {},
    ok: false,
  };

  /* ── 1. group verdicts ─────────────────────────────────────────────────── */
  const groups = new Map();                 // group -> Map(variant -> Set(path))
  for (const r of ir.rows) {
    if (!groups.has(r.group)) groups.set(r.group, new Map());
    const g = groups.get(r.group);
    if (!g.has(r.variant)) g.set(r.variant, new Set());
    g.get(r.variant).add(r.path);
  }

  const verdict = new Map();                // group -> 'modes' | 'separate' | 'ambiguous'
  const evidence = new Map();
  for (const [g, variants] of groups) {
    const names = [...variants.keys()];
    if (names.length === 1) {
      verdict.set(g, 'modes');
      evidence.set(g, { variants: 1, overlap: 1, note: 'single set' });
      continue;
    }
    const sets = names.map((n) => variants.get(n));
    /* Intersection over ALL variants, as a fraction of the smallest — using the
       smallest rather than the first makes the measure order-independent. */
    const smallest = sets.reduce((a, b) => (a.size <= b.size ? a : b));
    let shared = 0;
    for (const p of smallest) if (sets.every((s) => s.has(p))) shared++;
    const overlap = smallest.size ? shared / smallest.size : 0;
    const v = overlap >= MODES_MIN ? 'modes' : overlap <= SEPARATE_MAX ? 'separate' : 'ambiguous';
    verdict.set(g, v);
    evidence.set(g, { variants: names.length, overlap, shared, of: smallest.size,
                      note: overlap === 1 ? 'every variant defines the same paths'
                          : overlap === 0 ? 'no path defined by more than one variant'
                          : 'partial overlap — cannot be read either way' });
    if (v === 'ambiguous') {
      plan.ambiguous.push({ group: g, variants: names, overlap: +(overlap * 100).toFixed(1),
                            shared, of: smallest.size });
    }
  }

  /* ── 2. address every row to (collection, mode) ────────────────────────── */
  const address = (r) => verdict.get(r.group) === 'separate'
    ? { col: r.variant, mode: r.variant }     // a namespace of its own, one mode
    : { col: r.group, mode: r.variant };      // a mode of the group's collection

  /* ── 3. a variable is (collection, path); modes contribute values ──────── */
  const key = (a, b) => a + '␟' + b;
  const vars = new Map();
  const modesOf = new Map();
  for (const r of ir.rows) {
    const a = address(r);
    if (!modesOf.has(a.col)) modesOf.set(a.col, []);
    const ms = modesOf.get(a.col);
    if (ms.indexOf(a.mode) === -1) ms.push(a.mode);

    const k = key(a.col, r.path);
    let spec = vars.get(k);
    if (!spec) {
      spec = { col: a.col, path: r.path, types: new Set(), values: new Map(),
               description: r.description || '' };
      vars.set(k, spec);
    }
    spec.types.add(r.type);
    spec.values.set(a.mode, r.value);
    if (!spec.description && r.description) spec.description = r.description;
  }

  /* ── 4. types must be homogeneous across a variable's modes ────────────── */
  for (const spec of vars.values()) {
    const ts = [...spec.types];
    if (ts.length > 1) {
      plan.losses.typeConflicts.push({ collection: spec.col, path: spec.path, types: ts });
    }
    spec.type = ts[0];
    spec.ft = figmaType(spec.type);
  }

  /* ── 5. reference targets ──────────────────────────────────────────────—
     A reference names a token PATH, not a collection. If that path exists in
     more than one collection the reference is genuinely ambiguous — the source
     format resolved it by which sets a theme had enabled, and that context is
     gone once the sets have become collections. Reported rather than guessed. */
  const byPath = new Map();
  for (const spec of vars.values()) {
    if (!byPath.has(spec.path)) byPath.set(spec.path, []);
    byPath.get(spec.path).push(spec);
  }
  for (const [p, list] of byPath) {
    if (list.length > 1) plan.refCollisions.push({ path: p, collections: list.map((s) => s.col) });
  }

  /* ── 6. walk every value, classify what can and cannot land ────────────── */
  let literals = 0, aliases = 0, importable = 0;
  const compositePaths = new Set();
  for (const spec of vars.values()) {
    if (spec.ft === null) {
      compositePaths.add(spec.col + '/' + spec.path);
      plan.losses.composites.push({ collection: spec.col, path: spec.path, type: spec.type });
      continue;
    }
    importable++;
    for (const [mode, v] of spec.values) {
      if (v.ref !== undefined) {
        const targets = byPath.get(v.ref);
        const live = targets && targets.filter((t) => t.ft !== null);
        if (!live || !live.length) {
          plan.losses.unresolvedRefs.push({ collection: spec.col, path: spec.path, mode, ref: v.ref,
            reason: targets && targets.length ? 'target is a composite, so it is not a variable'
                                              : 'no token defines this path' });
        } else aliases++;
      } else if (v.expr !== undefined) {
        plan.losses.expressions.push({ collection: spec.col, path: spec.path, mode, expr: v.expr });
      } else if (v.literal && typeof v.literal === 'object') {
        plan.losses.composites.push({ collection: spec.col, path: spec.path, type: spec.type,
                                      note: 'object value under a non-composite type' });
      } else literals++;
    }
  }

  /* ── 7. collections, with the mode ceiling applied ─────────────────────── */
  const varsPerCol = new Map();
  for (const spec of vars.values()) {
    if (spec.ft === null) continue;
    varsPerCol.set(spec.col, (varsPerCol.get(spec.col) || 0) + 1);
  }
  for (const [name, modes] of modesOf) {
    const g = ir.rows.find((r) => address(r).col === name).group;
    const ev = evidence.get(g) || {};
    const count = varsPerCol.get(name) || 0;
    const entry = {
      name, modes: modes.slice(), variables: count,
      fromGroup: g,
      verdict: verdict.get(g),
      overlap: ev.overlap === undefined ? null : +(ev.overlap * 100).toFixed(1),
      evidence: ev.note,
      confidence: verdict.get(g) === 'ambiguous' ? 'AMBIGUOUS'
                : ev.variants === 1 ? 'certain (single set)'
                : ev.overlap === 1 || ev.overlap === 0 ? 'certain' : 'high',
    };
    if (count === 0) {
      plan.losses.emptyCollections.push({ name, reason: 'every token in it is a composite' });
      continue;
    }
    if (modes.length > modeCeiling) {
      plan.blocked.push({ collection: name, needs: modes.length, ceiling: modeCeiling,
                          reason: 'more modes than this file\'s plan allows' });
      entry.blocked = true;
    }
    plan.collections.push(entry);
  }
  plan.collections.sort((a, b) => b.variables - a.variables);

  plan.totals = {
    rows: ir.rows.length,
    sets: ir.sets ? ir.sets.length : null,
    collections: plan.collections.length,
    variables: importable,
    modeValues: literals + aliases,
    literals, aliases,
    composites: plan.losses.composites.length,
    blockedVariables: plan.blocked.reduce((n, b) => n + (varsPerCol.get(b.collection) || 0), 0),
  };
  const t = plan.totals;
  t.importablePct = t.rows ? +(100 * (t.literals + t.aliases) / t.rows).toFixed(1) : 0;

  /* An ambiguous group, a type conflict or a reference collision all mean the
     projection is not knowable from the file alone. Blocked collections do not
     make the plan invalid — they make it partial, which is a different thing
     and is the user's call. */
  plan.ok = plan.ambiguous.length === 0 &&
            plan.losses.typeConflicts.length === 0 &&
            plan.refCollisions.length === 0;
  plan.needsConfirmation = !plan.ok;

  return plan;
}

module.exports = { derive, figmaType, isComposite, MODES_MIN, SEPARATE_MAX,
                   FLOAT_TYPES, STRING_TYPES, COMPOSITE_TYPES };
