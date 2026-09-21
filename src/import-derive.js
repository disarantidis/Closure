/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
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
  sets are separate namespaces. On a real 34,481-token export this came out
  absolute — every group was either 100% or 0%, never in between.

  AND WHERE IT IS NOT ABSOLUTE, THE IMPORT STOPS. A group at 61% overlap is not
  a thing to guess at, because the wrong guess is silent. Ambiguity blocks and
  asks; it never picks the likelier reading.

  WHAT AN ANSWER LOOKS LIKE. Every open question gets an id — "group:theme",
  "type:core/radius.s", "ref:shared.c" — and a caller resolves it by passing a
  decision under that id. Decisions are the ONLY way past a refusal, they are
  recorded in the plan, and they serialise into the manifest, so answering a
  question once answers it for every later import of the same file.
*/

  var __dep = (typeof require !== 'undefined')
    ? require('./import-manifest.js')
    : global.PomImportManifest;
  var bindManifest = __dep.bindManifest;
/* Above MODES_MIN the variants are read as modes, at or below SEPARATE_MAX as
   separate collections, and anything between is refused. The band is wide on
   purpose: real axes share ~all their paths and real namespaces share ~none, so
   a group landing in the middle means the file is not saying what we think it
   is — which is a reason to ask, not to round. */
const MODES_MIN = 0.9;
const SEPARATE_MAX = 0;

/*
  FIGMA CAPS A COLLECTION AT 5,000 VARIABLES, and unlike the mode ceiling this
  one is not a plan tier — it is the same for everybody. Found the hard way: a
  real import ran 6,195 operations and then stopped on the 5,001st variable of
  a collection wanting 6,480.

  It has to be caught BEFORE anything is written, because of how the program is
  ordered. Every createVariable runs before any setValue, so a failure during
  variable creation leaves a file full of variables holding NOTHING — 6,192 of
  them, in the run that found this. Discovering the limit by hitting it is the
  worst possible time to discover it.

  Which collection blows it is a property of the DOCUMENT SHAPE, not its size.
  The system this came from holds that collection as 716 variables across two
  modes; the resolved export denormalises those modes into names, and 716
  becomes 6,480 in a single mode. Same tokens, nine times the variables.
*/
const VARIABLE_CEILING = 5000;

/* Figma has four variable types. Everything else is either one of these in
   disguise or not a variable at all. */
const FLOAT_TYPES = ['dimension', 'borderRadius', 'fontSizes', 'lineHeights', 'letterSpacing',
                     'number', 'spacing', 'sizing', 'borderWidth', 'opacity', 'paragraphSpacing',
                     'paragraphIndent'];
const STRING_TYPES = ['fontFamilies', 'fontWeights', 'textCase', 'textDecoration', 'string',
                      'asset', 'text', 'fontFamily', 'fontWeight'];
/* Not "unsupported" — NOT VARIABLES. A shadow or a type ramp is a Figma STYLE,
   a different API with a different shape. Reported as a loss for the variable
   importer and as the scope of a second one. */
const COMPOSITE_TYPES = ['typography', 'boxShadow', 'border', 'shadow', 'composition', 'gradient'];

const FIGMA_TYPES = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

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

/* W3C DTCG writes two SCALAR types as objects — colour as
   { colorSpace, components, alpha, hex } and dimension as { value, unit } —
   so "the value is an object" does not mean "the value is a composite". */
function isDtcgScalar(type, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (type === 'color') return value.components !== undefined || value.hex !== undefined;
  return value.value !== undefined && value.unit !== undefined;
}

const SEP = '␟';
const vkey = (col, path) => col + SEP + path;

/*
  ── THE LEVEL MAP ──────────────────────────────────────────────────────────

  A JSON has N nesting depths; Figma has three structural slots. Until now
  derive() read exactly ONE signal to bridge them — a "/" in a set name — and
  everything else became part of a token's name. That is enough for Tokens
  Studio, where the set IS the axis, and enough for nothing else.

  A level map says which DEPTH of a path is an axis:

      mode . light . neutral . colours . basic . background
       d0     d1       d2      └──────────┴──────────┘
              ↑
              promote this depth to the mode axis

  DEPTH IS RELATIVE TO THE TOKEN PATH, and the two adapters disagree about
  where that starts. Tokens Studio's set name is not part of any path, so
  "mode/light" + "brand.primary" puts the axis at depth 0 of "light.brand…"
  only if the set was flat; DTCG has no sets and keeps its top-level group in
  the path, so the same axis sits one deeper. A level map is therefore tied to
  the format it was written for — which is another reason it belongs in
  $figmaStructure beside the rest of the projection rather than in a config
  someone carries between files.

  It is applied as a PRE-TRANSFORM on the IR, before any other decision, which
  is what keeps it small: promoting depth 1 turns one group with 6,480 paths
  into one group with two variants of 3,240, and every existing step — the
  overlap measurement, the manifest binding, the verdicts — then works
  unchanged on the rewritten rows. Nothing downstream needs to know a level
  map exists.

  ONE AXIS PER COLLECTION, and this is a Figma constraint rather than a choice
  here: a variable collection has exactly one mode dimension. A document with
  two independent axes — light/dark AND twenty schemes — cannot become one
  collection, no matter how the depths are assigned. The system that produced
  that document solves it with SEPARATE collections and aliases between them,
  and an import cannot synthesise those, because it would have to invent which
  direction the dependency runs. So promoting a second depth is refused rather
  than approximated.
*/
function applyLevels(ir, levels) {
  if (!levels || !Object.keys(levels).length) return ir;
  const rows = ir.rows.map((r) => {
    const spec = levels[r.group];
    if (!spec) return r;
    const depths = Object.keys(spec).filter((d) => spec[d] === 'mode').map(Number).sort((a, b) => a - b);
    if (!depths.length) return r;
    const segs = r.path.split('.');
    const d = depths[0];
    if (d < 0 || d >= segs.length) return r;
    const variant = segs[d];
    const rest = segs.slice(0, d).concat(segs.slice(d + 1));
    /* The promoted segment leaves the NAME and becomes the mode, which is
       what stops it appearing twice — once as an axis and once inside every
       variable's own name. */
    return Object.assign({}, r, { variant, path: rest.join('.') || segs[d] });
  });
  return Object.assign({}, ir, { rows });
}

/*
  WHICH DEPTHS LOOK LIKE AXES, measured rather than guessed — the same
  reasoning the group verdict uses, one level down.

  A depth is a candidate when its distinct values are FEW relative to the rows
  beneath it, and when every one of those values carries the same set of paths
  below it. That second half is the real test: an axis is a dimension along
  which the same thing takes different values, so its branches must agree on
  what "the same thing" is. A depth whose branches hold disjoint names is a
  namespace, not an axis.

  Reported, never applied. The point of a candidate is that someone confirms it.
*/
function levelCandidates(ir, opts) {
  opts = opts || {};
  const maxValues = opts.maxValues || 64;
  const byGroup = new Map();
  for (const r of ir.rows) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r.path.split('.'));
  }
  const out = [];
  for (const [group, paths] of byGroup) {
    const depth = Math.min.apply(null, paths.map((p) => p.length));
    /* The last segment is the token's own name, never an axis. */
    for (let d = 0; d < depth - 1; d++) {
      const branches = new Map();
      for (const p of paths) {
        const key = p[d];
        if (!branches.has(key)) branches.set(key, new Set());
        branches.get(key).add(p.slice(0, d).concat(p.slice(d + 1)).join('.'));
      }
      const values = [...branches.keys()];
      if (values.length < 2 || values.length > maxValues) continue;
      const sets = values.map((v) => branches.get(v));
      const smallest = sets.reduce((a, b) => (a.size <= b.size ? a : b));
      let shared = 0;
      for (const x of smallest) if (sets.every((t) => t.has(x))) shared++;
      const overlap = smallest.size ? shared / smallest.size : 0;
      if (overlap >= MODES_MIN) {
        out.push({ group, depth: d, values, distinct: values.length,
                   overlap: +(overlap * 100).toFixed(1),
                   variablesIfPromoted: smallest.size });
      }
    }
  }
  return out;
}

function derive(ir, opts) {
  opts = opts || {};
  /* FIRST, before anything else looks at the rows — see applyLevels. */
  const levels = opts.levels || {};
  ir = applyLevels(ir, levels);

  const modeCeiling = opts.modeCeiling || Infinity;
  /* Figma's own hard limit, not a caller's preference — so it applies unless
     a caller deliberately turns it off, rather than only when asked for. */
  const variableCeiling = opts.variableCeiling === undefined ? VARIABLE_CEILING : opts.variableCeiling;
  const decisions = opts.decisions || {};

  const plan = {
    source: ir.source,
    usedManifest: false,
    collections: [],
    ambiguous: [],
    blocked: [],
    losses: { composites: [], expressions: [], unresolvedRefs: [], typeConflicts: [], emptyCollections: [] },
    refCollisions: [],
    /* Every open question, by id. compile() refuses while this is non-empty,
       and each entry names exactly what a decision for it must say. */
    unresolved: [],
    decisionsApplied: [],
    decisionsUnused: [],
    /* Depths that measure like axes but have not been promoted. Reported so a
       caller can offer them; never applied on their own. */
    levelCandidates: [],
    levelsApplied: levels,
    totals: {},
    ok: false,
  };

  const claim = (id) => {
    if (!Object.prototype.hasOwnProperty.call(decisions, id)) return undefined;
    plan.decisionsApplied.push({ id, value: decisions[id] });
    return decisions[id];
  };
  const ask = (id, question, options, detail) =>
    plan.unresolved.push(Object.assign({ id, question, options }, detail || {}));

  /* ── 1. group verdicts ─────────────────────────────────────────────────── */
  const groups = new Map();                 // group -> Map(variant -> Set(path))
  for (const r of ir.rows) {
    if (!groups.has(r.group)) groups.set(r.group, new Map());
    const g = groups.get(r.group);
    if (!g.has(r.variant)) g.set(r.variant, new Set());
    g.get(r.variant).add(r.path);
  }

  /* A DECLARATION BEATS A MEASUREMENT. $figmaStructure, when the document
     carries one, states the architecture the export came out of — including
     the names the export itself then threw away (".core" -> "core",
     "_restricted" -> "restrictions"). Bound per group, so a hand-added set
     falls through to measurement without invalidating the rest, and a manifest
     that matches nothing at all is ignored entirely. */
  const bound = opts.ignoreManifest ? null : bindManifest(ir, ir.manifest);
  plan.usedManifest = !!bound;
  if (bound) plan.manifestBinding = { bound: bound.bound, measured: bound.unbound };

  const verdict = new Map();                // group -> 'modes' | 'separate'
  const naming = new Map();                 // group -> how the manifest names it
  const evidence = new Map();
  for (const [g, variants] of groups) {
    const names = [...variants.keys()];

    const b = bound && bound.bindings.get(g);
    if (b) {
      verdict.set(g, b.verdict);
      naming.set(g, b);
      evidence.set(g, { variants: names.length, overlap: null, declared: true,
                        note: 'declared by $figmaStructure' });
      continue;
    }

    if (names.length === 1) {
      verdict.set(g, 'modes');
      evidence.set(g, { variants: 1, overlap: 1, note: 'single set', decided: false });
      continue;
    }
    const sets = names.map((n) => variants.get(n));
    /* Intersection over ALL variants as a fraction of the SMALLEST — using the
       smallest rather than the first makes the measure order-independent. */
    const smallest = sets.reduce((a, b) => (a.size <= b.size ? a : b));
    let shared = 0;
    for (const p of smallest) if (sets.every((s) => s.has(p))) shared++;
    const overlap = smallest.size ? shared / smallest.size : 0;

    let v = overlap >= MODES_MIN ? 'modes' : overlap <= SEPARATE_MAX ? 'separate' : null;
    let decided = false;
    if (v === null) {
      const answer = claim('group:' + g);
      if (answer === 'modes' || answer === 'separate') { v = answer; decided = true; }
    }
    if (v === null) {
      v = 'modes';                          // provisional, only so the rest can be reported
      plan.ambiguous.push({ group: g, variants: names, overlap: +(overlap * 100).toFixed(1),
                            shared, of: smallest.size });
      ask('group:' + g,
          'Are the ' + names.length + ' variants of "' + g + '" modes of one collection, or separate collections?',
          ['modes', 'separate'],
          { evidence: names.length + ' variants share ' + shared + ' of ' + smallest.size +
                      ' paths (' + (overlap * 100).toFixed(1) + '%)' });
    }
    verdict.set(g, v);
    evidence.set(g, { variants: names.length, overlap, shared, of: smallest.size, decided,
                      note: overlap === 1 ? 'every variant defines the same paths'
                          : overlap === 0 ? 'no path defined by more than one variant'
                          : 'partial overlap — cannot be read from the file' });
  }

  /* ── 2. address every row to (collection, mode) ────────────────────────── */
  const address = (r) => {
    const n = naming.get(r.group);
    if (n) {
      /* The manifest's own names — this is the only route by which ".core"
         comes back as ".core" rather than "core". */
      return n.verdict === 'separate'
        ? { col: n.per[r.variant].collection, mode: n.per[r.variant].mode }
        : { col: n.collection, mode: n.modeName[r.variant] || r.variant };
    }
    return verdict.get(r.group) === 'separate'
      ? { col: r.variant, mode: r.variant }   // a namespace of its own, one mode
      : { col: r.group, mode: r.variant };    // a mode of the group's collection
  };

  /* ── 3. a variable is (collection, path); modes contribute values ──────── */
  const vars = new Map();
  const modesOf = new Map();
  const groupOfCol = new Map();
  for (const r of ir.rows) {
    const a = address(r);
    if (!modesOf.has(a.col)) { modesOf.set(a.col, []); groupOfCol.set(a.col, r.group); }
    const ms = modesOf.get(a.col);
    if (ms.indexOf(a.mode) === -1) ms.push(a.mode);

    const k = vkey(a.col, r.path);
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

  /* ── 4. a variable is ONE type across all its modes ────────────────────── */
  for (const spec of vars.values()) {
    const ts = [...spec.types];
    spec.type = ts[0];
    spec.ft = figmaType(spec.type);
    if (ts.length > 1) {
      const id = 'type:' + spec.col + '/' + spec.path;
      const answer = claim(id);
      if (answer && FIGMA_TYPES.indexOf(answer) !== -1) { spec.ft = answer; spec.typeDecided = true; }
      else {
        plan.losses.typeConflicts.push({ collection: spec.col, path: spec.path, types: ts });
        ask(id, 'Variable "' + spec.col + '/' + spec.path + '" is ' + ts.join(' in one mode and ') +
                ' in another. Which Figma type?', FIGMA_TYPES.slice(),
            { evidence: 'declared types: ' + ts.join(', ') });
      }
    }
  }

  /* ── 5. reference targets ──────────────────────────────────────────────—
     A reference names a token PATH, not a collection. If that path exists in
     more than one collection the reference is genuinely ambiguous — the source
     format resolved it by which sets a theme had enabled, and that context is
     gone once the sets have become collections. Asked, never guessed. */
  const byPath = new Map();
  for (const spec of vars.values()) {
    if (!byPath.has(spec.path)) byPath.set(spec.path, []);
    byPath.get(spec.path).push(spec);
  }
  /* Only a path something actually POINTS AT can be ambiguous. Two collections
     holding a variable of the same name is ordinary — Figma allows it and it
     carries no meaning — so a duplicate nobody references is not a question,
     and asking about it would bury the real ones. */
  const referenced = new Set();
  for (const spec of vars.values()) {
    for (const v of spec.values.values()) if (v.ref !== undefined) referenced.add(v.ref);
  }

  const refTarget = new Map();              // path -> the one spec it resolves to
  for (const [p, list] of byPath) {
    const live = list.filter((s) => s.ft !== null);
    if (live.length <= 1) { if (live.length) refTarget.set(p, live[0]); continue; }
    if (!referenced.has(p)) continue;       // duplicated, but nothing can hit it
    const id = 'ref:' + p;
    const answer = claim(id);
    const picked = answer && live.filter((s) => s.col === answer)[0];
    if (picked) { refTarget.set(p, picked); continue; }
    plan.refCollisions.push({ path: p, collections: live.map((s) => s.col) });
    ask(id, 'Path "' + p + '" is defined in ' + live.length + ' collections. Which one do references to it mean?',
        live.map((s) => s.col), { evidence: 'defined in: ' + live.map((s) => s.col).join(', ') });
  }

  /* ── 6. walk every value, classify what can and cannot land ────────────── */
  let literals = 0, aliases = 0, importable = 0;
  for (const spec of vars.values()) {
    if (spec.ft === null) {
      plan.losses.composites.push({ collection: spec.col, path: spec.path, type: spec.type });
      continue;
    }
    importable++;
    for (const [mode, v] of spec.values) {
      if (v.ref !== undefined) {
        const target = refTarget.get(v.ref);
        if (!target) {
          const known = byPath.has(v.ref);
          plan.losses.unresolvedRefs.push({ collection: spec.col, path: spec.path, mode, ref: v.ref,
            reason: known ? 'target is a composite, so it is not a variable'
                          : 'no token defines this path' });
        } else { aliases++; spec.resolved = true; }
      } else if (v.expr !== undefined) {
        plan.losses.expressions.push({ collection: spec.col, path: spec.path, mode, expr: v.expr });
      } else if (v.literal && typeof v.literal === 'object' && !isDtcgScalar(spec.type, v.literal)) {
        /* An object under a non-composite type USUALLY means the type is
           lying. The exception is DTCG's own scalars — colour and dimension
           are objects in that spec — and treating those as composites is what
           made a real document import as 723 of 8,312 tokens with no colours
           at all. */
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
    const g = groupOfCol.get(name);
    const ev = evidence.get(g) || {};
    const count = varsPerCol.get(name) || 0;
    const entry = {
      name, modes: modes.slice(), variables: count, fromGroup: g,
      verdict: verdict.get(g),
      overlap: ev.overlap === undefined ? null : +(ev.overlap * 100).toFixed(1),
      evidence: ev.note,
      confidence: plan.ambiguous.some((a) => a.group === g) ? 'AMBIGUOUS'
                : ev.declared ? 'declared'
                : ev.decided ? 'decided by caller'
                : ev.variants === 1 ? 'certain (single set)'
                : ev.overlap === 1 || ev.overlap === 0 ? 'certain' : 'high',
    };
    if (count === 0) {
      plan.losses.emptyCollections.push({ name, reason: 'every token in it is a composite' });
      continue;
    }
    if (modes.length > modeCeiling) {
      plan.blocked.push({ collection: name, kind: 'modes', needs: modes.length, ceiling: modeCeiling,
                          reason: "more modes than this file's plan allows" });
      entry.blocked = true;
    }
    if (count > variableCeiling) {
      plan.blocked.push({ collection: name, kind: 'variables', needs: count, ceiling: variableCeiling,
                          reason: 'more variables than Figma allows in one collection' });
      entry.blocked = true;
    }
    plan.collections.push(entry);
  }
  plan.collections.sort((a, b) => b.variables - a.variables);

  /* One axis per collection is Figma's rule, not a preference — a second
     promoted depth cannot be expressed at all, so it is refused rather than
     silently ignored. */
  for (const g of Object.keys(levels)) {
    const promoted = Object.keys(levels[g]).filter((d) => levels[g][d] === 'mode');
    if (promoted.length > 1) {
      plan.unresolved.push({
        id: 'level:' + g, options: promoted.map((d) => 'depth ' + d),
        question: '"' + g + '" promotes ' + promoted.length + ' depths to modes, and a Figma ' +
                  'collection has exactly one mode axis. Which one is the axis?',
        evidence: 'depths ' + promoted.join(', ') + ' were all marked as modes',
      });
    }
  }

  /* Only worth reporting for a group whose depths were NOT already assigned —
     confirming what the caller just chose is noise. */
  plan.levelCandidates = levelCandidates(ir).filter((c) => !levels[c.group]);

  for (const id of Object.keys(decisions)) {
    if (!plan.decisionsApplied.some((d) => d.id === id)) plan.decisionsUnused.push(id);
  }

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

  /* A blocked collection does not make the plan invalid — it makes it PARTIAL,
     which is the user's call and is gated separately in compile(). Only an open
     question makes it unusable. */
  plan.ok = plan.unresolved.length === 0;
  plan.needsConfirmation = !plan.ok;

  /* Everything compile() needs, kept off the reported surface so a plan stays
     printable and serialisable. */
  Object.defineProperty(plan, '_internals', {
    enumerable: false, value: { vars, modesOf, refTarget, verdict, address },
  });

  return plan;
}

  var api = { derive, applyLevels, levelCandidates, figmaType, isComposite, isDtcgScalar, vkey,
                   MODES_MIN, SEPARATE_MAX, FIGMA_TYPES, VARIABLE_CEILING,
                   FLOAT_TYPES, STRING_TYPES, COMPOSITE_TYPES };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportDerive = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
