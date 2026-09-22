/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  COMPILE — turn a plan into an ordered list of operations, or refuse.

  THIS IS THE GATE, AND IT EXISTS BEFORE ANY WRITER DOES. That ordering is
  deliberate. A check added after a write path already works is a check someone
  can forget to call; a check that is the only way to OBTAIN the thing a writer
  consumes cannot be skipped, because there is nothing else to pass it.

  So: apply() will take a program. Only compile() produces a program. And
  compile() produces nothing at all while the plan has an open question.

  THE PROGRAM IS PURE DATA — no Figma objects, no closures, no judgement. Every
  decision has already been made by the time it exists, which leaves apply() as
  a loop with a switch in it and nothing to get wrong. It can be diffed,
  reviewed, stored, and replayed.

  TWO THINGS ARE ENCODED IN THE OPS RATHER THAN LEFT TO THE INTERPRETER, both
  because they are exactly the mistakes a careless writer makes:

  1. createVariableCollection ALREADY HAS A MODE, auto-named "Mode 1". The
     first mode must be a rename and only the rest additions. A writer that
     loops addMode() over every mode leaves a junk mode behind AND burns one of
     the ceiling's slots. So the program says renameMode for the first and
     addMode for the rest, explicitly, and apply() never has to know.

  2. ALIASES COME LAST, as their own phase. Not because the dependency order
     demands it — because deferring every reference to a final pass means the
     order collections are created in stops mattering at all, and the
     topological sort the alias DAG seems to require is never needed.
*/

  var __dep = (typeof require !== 'undefined')
    ? require('./import-derive.js')
    : global.PomImportDerive;
  var vkey = __dep.vkey;
/*
  #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() -> Figma's 0..1 RGBA.

  RETURNS NULL RATHER THAN GUESSING. An unparseable colour has to become a
  refusal, because the alternative is writing black and calling it a success —
  and a wrong colour is indistinguishable from a deliberate one once it is in
  the file.

  rgba() is here because the gate found it: a real 34,481-token export turned
  out to carry 19 of them among 374 hex values, and refusing the whole import
  over a form that is perfectly well defined would have been the wrong kind of
  strict. Channels may be 0-255 or a percentage; alpha is 0-1 or a percentage.
*/
function toColor(v) {
  /*
    DTCG's OWN COLOUR SHAPE, which is an object and not a string:
    { colorSpace, components, alpha, hex }. Missing this is not a small gap —
    it is every colour in a W3C DTCG document, and because the primitives are
    what everything else references, losing them takes the whole graph with
    them. A real import of one landed 723 variables out of 8,312 and not a
    single COLOR among them.

    `components` is preferred over `hex` when the space is sRGB, because it is
    the more precise of the two and `hex` is the spec's fallback for exactly
    that reason. For any other space the components are not sRGB channels and
    must not be read as though they were, so the hex fallback is the only
    honest answer — and if there is none, this returns null rather than
    inventing a colour in the wrong space.
  */
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const space = v.colorSpace === undefined ? 'srgb' : String(v.colorSpace).toLowerCase();
    const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
    const alpha = v.alpha === undefined || v.alpha === null ? 1 : Number(v.alpha);
    if ((space === 'srgb' || space === 'srgb-linear') && Array.isArray(v.components) && v.components.length >= 3) {
      const c = v.components.map(Number);
      if (c.slice(0, 3).every(isFinite) && isFinite(alpha)) {
        return { r: clamp01(c[0]), g: clamp01(c[1]), b: clamp01(c[2]), a: clamp01(alpha) };
      }
    }
    if (typeof v.hex === 'string') {
      const fromHex = toColor(v.hex);
      /* An 8-digit hex carries its own alpha; a 6-digit one does not, so the
         separate `alpha` still applies. */
      if (fromHex && v.hex.replace(/^#/, '').length !== 8 && isFinite(alpha)) fromHex.a = clamp01(alpha);
      return fromHex;
    }
    return null;
  }

  if (typeof v !== 'string') return null;
  const s = v.trim();

  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    /* Both the legacy "r, g, b, a" and the modern "r g b / a" spellings. */
    const parts = fn[1].split(/[,/\s]+/).map((x) => x.trim()).filter((x) => x !== '');
    if (parts.length < 3 || parts.length > 4) return null;
    const chan = (x) => {
      if (/%$/.test(x)) { const p = parseFloat(x); return isFinite(p) ? p / 100 : null; }
      const n = parseFloat(x);
      return isFinite(n) ? n / 255 : null;
    };
    const alpha = (x) => {
      if (x === undefined) return 1;
      if (/%$/.test(x)) { const p = parseFloat(x); return isFinite(p) ? p / 100 : null; }
      const n = parseFloat(x);
      return isFinite(n) ? n : null;
    };
    const r = chan(parts[0]), g = chan(parts[1]), b = chan(parts[2]), a = alpha(parts[3]);
    if (r === null || g === null || b === null || a === null) return null;
    const clamp = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
    return { r: clamp(r), g: clamp(g), b: clamp(b), a: clamp(a) };
  }

  let h = s.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

/*
  A FLOAT may arrive carrying its unit — "100%", "0px", "-2.5%".

  STRIPPING IT RESTORES THE SOURCE, it does not lose it. Figma's FLOAT is
  unitless; the property a variable is bound to decides how to read it, and the
  file these came from stores line-heights/100 as the number 100 while the
  export writes "100%". So the unit is something the exporter ADDED, and taking
  it off is the inverse of that rather than a lossy guess. Checked against the
  real file before it was written this way.

  What would be a real conflict is one variable whose modes disagree about the
  unit — 10px in one and 10% in another are not the same quantity, and no
  single number means both. That is caught in compile() and refused.
*/
const UNITED_NUMBER = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(px|%|rem|em|pt)\s*$/i;

function coerce(ft, raw) {
  if (ft === 'COLOR') {
    const c = toColor(raw);
    return c ? { ok: true, value: c } : { ok: false, why: 'not a colour: ' + JSON.stringify(raw) };
  }
  if (ft === 'FLOAT') {
    /* DTCG's dimension is { value, unit } — the same "a number wearing its
       unit" case as "100%", just spelled as an object. Stripping the unit is
       the same decision and for the same reason: Figma's FLOAT is unitless. */
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.value !== undefined) {
      const n = Number(raw.value);
      return isFinite(n)
        ? { ok: true, value: n, unit: raw.unit ? String(raw.unit).toLowerCase() : undefined }
        : { ok: false, why: 'dimension with a non-numeric value: ' + JSON.stringify(raw) };
    }
    if (typeof raw === 'number') return isFinite(raw) ? { ok: true, value: raw } : { ok: false, why: 'not finite' };
    const m = typeof raw === 'string' && UNITED_NUMBER.exec(raw);
    if (m) return { ok: true, value: Number(m[1]), unit: m[2].toLowerCase() };
    const n = Number(raw);
    return isFinite(n) && raw !== '' && raw !== null
      ? { ok: true, value: n }
      : { ok: false, why: 'not a number: ' + JSON.stringify(raw) };
  }
  if (ft === 'BOOLEAN') return { ok: true, value: raw === true || raw === 'true' };
  return { ok: true, value: String(raw) };
}

/*
  compile(ir, plan, opts) -> { ok: true, program, manifest, stats }
                          |  { ok: false, refusals: [...] }

  opts.allowPartial   a collection over the target's mode ceiling is DROPPED
                      rather than refusing the whole import. Off by default:
                      silently importing 13 of 14 collections is exactly the
                      kind of partial success that gets mistaken for a whole
                      one, so it has to be asked for.
  opts.evaluateExpressions
                      write "{a}*2" as its evaluated literal. Off by default —
                      it loses the reference, and a scale whose base no longer
                      propagates is worse than a scale that is visibly absent.
*/
function compile(ir, plan, opts) {
  opts = opts || {};
  const refusals = [];

  /* ── the gate ──────────────────────────────────────────────────────────── */
  if (plan.unresolved && plan.unresolved.length) {
    for (const q of plan.unresolved) {
      refusals.push({ kind: 'unresolved', id: q.id, question: q.question,
                      options: q.options, evidence: q.evidence });
    }
  }
  if (plan.blocked.length && !opts.allowPartial) {
    for (const b of plan.blocked) {
      refusals.push({ kind: 'blocked', id: 'blocked:' + b.collection,
        question: b.kind === 'variables'
          ? 'Collection "' + b.collection + '" would hold ' + b.needs.toLocaleString() +
            ' variables and Figma allows ' + b.ceiling.toLocaleString() + ' in one collection. ' +
            'Import the rest without it?'
          : 'Collection "' + b.collection + '" needs ' + b.needs +
            ' modes and the target allows ' + b.ceiling + '. Import the rest without it?',
        options: b.kind === 'variables'
          ? ['pass allowPartial to drop it',
             'import a shape that keeps these as modes rather than as names']
          : ['pass allowPartial to drop it', 'import into a file whose plan allows more modes'] });
    }
  }
  if (refusals.length) return { ok: false, refusals, program: null };

  const { vars, modesOf, refTarget } = plan._internals;
  const dropped = new Set(plan.blocked.map((b) => b.collection));
  const keep = new Set(plan.collections.filter((c) => !dropped.has(c.name)).map((c) => c.name));

  const program = { version: 1, source: ir.source, ops: [] };
  const push = (op) => program.ops.push(op);
  const stats = { collections: 0, modes: 0, variables: 0, literals: 0, aliases: 0,
                  skippedComposite: 0, skippedExpression: 0, skippedUnresolved: 0,
                  unitsDropped: [], skippedEmpty: 0, skippedEmptyCollections: [] };
  const unitsDropped = stats.unitsDropped;

  /*
    ── phase 2: variables, but only the ones that will hold something ───────

    A VARIABLE WITH NO VALUE IN ANY MODE IS JUNK. Figma will happily create it
    and fill it with a type default — 0, black, "" — which looks like a real
    token and is not one. On a real slice this was 145 of 193 variables: the
    typography sub-values, whose every value is a reference to something the
    document does not contain.

    Found by asking what apply() would actually write, rather than by counting
    what compile() produced.

    Dropping them is a FIXPOINT, not a filter: an alias pointing at a dropped
    variable has nothing to point at, so it is dropped too, and so on until
    nothing more falls. Composites are excluded up front for the same reason —
    they are not variables at all, so nothing may alias them either.
  */
  const writable = (spec, alive) => {
    for (const v of spec.values.values()) {
      if (v.ref !== undefined) {
        const t = refTarget.get(v.ref);
        if (t && t.ft !== null && alive.has(vkey(t.col, t.path))) return true;
      } else if (v.expr !== undefined) {
        if (opts.evaluateExpressions && evaluate(v.expr, plan, spec.values.keys().next().value) !== null) return true;
      } else if (v.literal !== undefined) {
        /* Ask coerce() rather than assuming an object literal must be a
           composite — DTCG writes plain colours and dimensions as objects,
           and refusing them here is what silently emptied a whole document. */
        if (coerce(spec.ft, v.literal).ok) return true;
      }
    }
    return false;
  };

  const alive = new Set();
  for (const spec of vars.values()) {
    if (keep.has(spec.col) && spec.ft !== null) alive.add(vkey(spec.col, spec.path));
    else if (spec.ft === null) stats.skippedComposite++;
  }
  for (;;) {
    let dropped = 0;
    for (const spec of vars.values()) {
      const k = vkey(spec.col, spec.path);
      if (!alive.has(k)) continue;
      if (!writable(spec, alive)) { alive.delete(k); dropped++; }
    }
    if (!dropped) break;
  }
  stats.skippedEmpty = 0;
  for (const spec of vars.values()) {
    const k = vkey(spec.col, spec.path);
    if (keep.has(spec.col) && spec.ft !== null && !alive.has(k)) stats.skippedEmpty++;
  }

  /* Which collections still have anything in them, decided before phase 1 so
     an empty one is never created in the first place. */
  const nonEmpty = new Set();
  for (const spec of vars.values()) if (alive.has(vkey(spec.col, spec.path))) nonEmpty.add(spec.col);

  /*
    ── the order collections are CREATED in, which is the only order Figma
       offers ──────────────────────────────────────────────────────────────

    The Plugin API has no way to reorder variable collections: a collection
    exposes its name, its modes and its variables, and nothing that says where
    it sits in the panel. The rail lists them in the order they were made. So
    the one moment this can be decided is here, and only for collections an
    import CREATES — one already in the file keeps its place, because apply()
    reuses it rather than making it again.

    LAST HOP FIRST. A token file is a chain: primitives at the bottom, then
    each layer aliasing the one beneath it, up to the semantic layer a designer
    actually picks from. Reading order and dependency order are opposites —
    nobody opens the panel looking for "core.dimension.4", they open it looking
    for "foundation.colours.basic.text" — so the deepest CONSUMER is created
    first and the primitives last.

    Depth is the longest path down the alias graph, computed from the same
    refTarget map phase 4 uses, so it describes the references that will
    actually be written rather than the ones the file mentions. Cycles cannot
    lengthen a path: a name already on the current descent contributes zero.
    Ties keep the document's own order, so the result is stable.
  */
  const dependsOn = new Map();
  for (const spec of vars.values()) {
    if (!keep.has(spec.col) || !nonEmpty.has(spec.col)) continue;
    if (!dependsOn.has(spec.col)) dependsOn.set(spec.col, new Set());
    for (const [, v] of spec.values) {
      if (v.ref === undefined) continue;
      const t = refTarget.get(v.ref);
      if (t && t.col !== spec.col) dependsOn.get(spec.col).add(t.col);
    }
  }
  const depthMemo = new Map();
  const depthOf = (name, onPath) => {
    if (depthMemo.has(name)) return depthMemo.get(name);
    if (onPath.has(name)) return 0;                 // a cycle adds no length
    onPath.add(name);
    let d = 0;
    for (const t of (dependsOn.get(name) || [])) d = Math.max(d, 1 + depthOf(t, new Set(onPath)));
    onPath.delete(name);
    depthMemo.set(name, d);
    return d;
  };
  const creationOrder = [...modesOf.keys()];
  const documentOrder = new Map(creationOrder.map((n, i) => [n, i]));
  creationOrder.sort((a, b) => {
    const d = depthOf(b, new Set()) - depthOf(a, new Set());
    return d !== 0 ? d : documentOrder.get(a) - documentOrder.get(b);
  });

  /* ── phase 1: collections and modes ────────────────────────────────────── */
  for (const name of creationOrder) {
    const modes = modesOf.get(name);
    if (!keep.has(name)) continue;
    /* A collection with nothing left alive in it would be created empty, which
       is the same junk one level up — `foundation` in a real slice, whose every
       variable was a typography sub-value that got dropped above. */
    if (!nonEmpty.has(name)) { stats.skippedEmptyCollections.push(name); continue; }
    push({ op: 'createCollection', collection: name, firstMode: modes[0] });
    stats.collections++; stats.modes++;
    for (let i = 1; i < modes.length; i++) {
      push({ op: 'addMode', collection: name, mode: modes[i] });
      stats.modes++;
    }
  }

  /* ── phase 2: the variables that survived ──────────────────────────────── */
  const emitted = new Set();
  for (const spec of vars.values()) {
    if (!alive.has(vkey(spec.col, spec.path))) continue;
    const name = spec.path.split('.').join('/');
    push({ op: 'createVariable', collection: spec.col, name, type: spec.ft,
           description: spec.description || undefined });
    emitted.add(vkey(spec.col, spec.path));
    stats.variables++;
  }


  /* ── phase 3: literals ─────────────────────────────────────────────────── */
  for (const spec of vars.values()) {
    if (!emitted.has(vkey(spec.col, spec.path))) continue;
    const name = spec.path.split('.').join('/');
    for (const [mode, v] of spec.values) {
      if (v.ref !== undefined) continue;
      if (v.expr !== undefined) {
        if (!opts.evaluateExpressions) { stats.skippedExpression++; continue; }
        const out = evaluate(v.expr, plan, mode);
        if (out === null) { stats.skippedExpression++; continue; }
        push({ op: 'setValue', collection: spec.col, name, mode, value: out,
               note: 'evaluated from ' + v.expr + ' — reference lost' });
        stats.literals++;
        continue;
      }
      const c = coerce(spec.ft, v.literal);
      if (!c.ok) { refusals.push({ kind: 'value', id: 'value:' + spec.col + '/' + spec.path + '@' + mode,
                                   question: c.why }); continue; }
      /* 10px in one mode and 10% in another are not the same quantity, and a
         unitless FLOAT cannot mean both. Only a DISAGREEMENT is a problem —
         one unit used consistently is just the exporter's spelling. */
      if (c.unit) {
        if (spec._unit && spec._unit !== c.unit) {
          refusals.push({ kind: 'unit', id: 'unit:' + spec.col + '/' + spec.path,
            question: 'Variable "' + spec.col + '/' + spec.path + '" is given in ' +
                      spec._unit + ' in one mode and ' + c.unit + ' in another; a Figma FLOAT is unitless.' });
          continue;
        }
        spec._unit = c.unit;
        if (unitsDropped.indexOf(c.unit) === -1) unitsDropped.push(c.unit);
      }
      push({ op: 'setValue', collection: spec.col, name, mode, value: c.value });
      stats.literals++;
    }
  }

  /* ── phase 4: aliases, last, so every target already exists ────────────── */
  for (const spec of vars.values()) {
    if (!emitted.has(vkey(spec.col, spec.path))) continue;
    const name = spec.path.split('.').join('/');
    for (const [mode, v] of spec.values) {
      if (v.ref === undefined) continue;
      const target = refTarget.get(v.ref);
      if (!target || !emitted.has(vkey(target.col, target.path))) { stats.skippedUnresolved++; continue; }
      push({ op: 'setAlias', collection: spec.col, name, mode,
             target: { collection: target.col, name: target.path.split('.').join('/') } });
      stats.aliases++;
    }
  }

  if (refusals.length) return { ok: false, refusals, program: null };

  return { ok: true, program, stats, manifest: toManifest(plan) };
}

/* Substitute every {ref} with its first literal and evaluate the arithmetic.
   Deliberately narrow: digits and operators only, so nothing in a token file
   can turn into executable code. */
function evaluate(expr, plan, mode) {
  const { vars } = plan._internals;
  /*
    Through coerce(), not a typeof check — the exporter writes numbers as
    strings ("4") and sometimes with a unit ("4px"), and an evaluator that only
    accepted a JS number silently skipped every expression in a real file for
    that reason alone.

    AND TRANSITIVELY, because these expressions are a chain, not a leaf:
    "{dimension.1}*0.25" points at "1*{dimension.base}" which points at "4".
    Resolving only one hop skipped 102 of 121 expressions in a real export —
    a half-working evaluator that quietly covers 16% of the cases is worse
    than either a complete one or none at all. Depth-guarded, and it returns
    null on a cycle rather than looping.
  */
  /*
    RESOLVED IN THE MODE BEING WRITTEN, not in whichever mode happens to come
    first. "( {typography.display.size} / 100 ) * {line-heights.100}" is a
    per-breakpoint calculation: `size` holds a different number in every mode,
    so taking values.values()[0] gave every breakpoint the mobile answer.

    The closure check found this — 24 values came back materially wrong while
    every count and every name still lined up, which is precisely the kind of
    defect no amount of "did it import?" will show.

    Mode is matched BY NAME, because a referenced variable may live in another
    collection whose modes are its own. Where the target has no mode of that
    name the first value is the only available answer, which is correct for the
    single-mode collections that most primitives live in.
  */
  const litAt = (path, mode, seen) => {
    seen = seen || new Set();
    const memo = path + '\u0000' + mode;
    if (seen.has(memo) || seen.size > 32) return null;
    seen.add(memo);
    for (const s of vars.values()) {
      if (s.path !== path) continue;
      const v = s.values.has(mode) ? s.values.get(mode) : s.values.values().next().value;
      if (!v) continue;
      if (v.literal !== undefined) {
        const c = coerce('FLOAT', v.literal);
        if (c.ok) return c.value;
      } else if (v.ref !== undefined) {
        const n = litAt(v.ref, mode, seen);
        if (n !== null) return n;
      } else if (v.expr !== undefined) {
        const n = evalWith(v.expr, mode, seen);
        if (n !== null) return n;
      }
    }
    return null;
  };

  function evalWith(e, mode, seen) {
    let good = true;
    const sub = e.replace(/\{([^}]+)\}/g, (_, p) => {
      const n = litAt(p, mode, seen);
      if (n === null) { good = false; return 'NaN'; }
      return String(n);
    });
    if (!good || !/^[\d\s.+\-*/()]+$/.test(sub)) return null;
    try {
      const out = Function('"use strict";return (' + sub + ')')();
      return typeof out === 'number' && isFinite(out) ? out : null;
    } catch (err) { return null; }
  }
  return evalWith(expr, mode, new Set());
}

/*
  The plan, as the declaration that makes the next import of this file need no
  derivation at all. Written back into the document as $figmaStructure on
  export: a question answered once is answered for good, and a file that
  carries its own structure can never be mis-projected.
*/
function toManifest(plan) {
  const m = {
    version: 1,
    /*
      `figmaName`, NOT `name` — this is the same field src/import-manifest.js
      writes on the export side and reads in bindManifest(), and it has to be
      the one key because there is only one $figmaStructure.

      These two were written months apart in the same afternoon and never met:
      buildManifest() emitted figmaName, toManifest() emitted name, and nothing
      had yet round-tripped an import's own manifest back through an import.
      The first thing that did got a collection called "undefined".
    */
    collections: plan.collections.map((c) => ({
      figmaName: c.name,
      modes: c.modes,
      fromGroup: c.fromGroup,
      verdict: c.verdict,
    })),
    decisions: plan.decisionsApplied,
  };
  /*
    THE LEVEL MAP TRAVELS WITH THE DOCUMENT, and it is the part that most needs
    to. Everything else in this manifest can be re-derived from the file if it
    is lost — the collections, the verdicts, all of it comes back from
    measuring. A level map cannot: whether light/dark are modes, collections,
    or names is a fact about the SYSTEM, not about the bytes, and no amount of
    looking at the file settles it.

    Only written when there is one. An empty object would claim the question
    was answered when it was never asked.
  */
  if (plan.levelsApplied && Object.keys(plan.levelsApplied).length) m.levels = plan.levelsApplied;
  return m;
}

  var api = { compile, toManifest, toColor, coerce, evaluate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportCompile = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
