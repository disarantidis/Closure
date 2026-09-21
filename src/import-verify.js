/*
  STRUCTURAL CLOSURE — does the round trip close?

  Closure already validates REFERENCE closure: every {ref} in an export has a
  target inside it. This is the same idea one level up. A file has structural
  closure when

      Figma -> export -> import

  puts back what it took out. And the useful part is that it can be checked
  without knowing the right answer in advance, which is exactly the situation
  an arbitrary third-party JSON puts you in: you cannot assert that a file you
  have never seen projects correctly, but you CAN require that the round trip
  agrees with itself.

  NO FIGMA IS INVOLVED. A compiled program already describes, exhaustively,
  what Figma would contain if it were applied — so materialise() interprets it
  into the same shape an extract has, and the two are compared as data. That
  means the check runs in the suite, offline, in milliseconds, against a real
  file's real numbers.

  IT DOES NOT RETURN A BOOLEAN, because "equal / not equal" is the wrong
  question. A round trip through this exporter is a SUPERSET: it invents
  primitives (textCase/none, the typography text-case split) that were never
  variables in the source. Those are EXTRA and they are fine. What is never
  fine is MISSING — a variable the source had and the round trip lost — or
  CHANGED, a variable that came back holding something else. Extras are
  reported; missing and changed are failures.
*/

const ROUND = 1e6;                    // colours and numbers compared at 6dp
const r6 = (n) => Math.round(n * ROUND) / ROUND;

function fmtValue(v) {
  if (v && typeof v === 'object') {
    if (v.type === 'VARIABLE_ALIAS') return null;          // handled by the caller
    if ('r' in v) {
      return '#' + [v.r, v.g, v.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('') +
             (v.a !== undefined && v.a < 1 ? ':' + r6(v.a) : '');
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'number') return String(r6(v));
  return String(v);
}

/*
  A compiled program, interpreted into the same shape an extract has. This is
  apply() with no side effects — and writing it first is what makes apply()
  itself trivial, since the semantics of every op are pinned here before
  anything touches a document.
*/
function materialise(program) {
  const collections = new Map();        // name -> { modes: [], vars: Map(name -> Map(mode -> value)) }
  const get = (n) => {
    if (!collections.has(n)) collections.set(n, { modes: [], vars: new Map() });
    return collections.get(n);
  };
  for (const op of program.ops) {
    const c = get(op.collection);
    switch (op.op) {
      case 'createCollection': c.modes.push(op.firstMode); break;
      case 'addMode': c.modes.push(op.mode); break;
      case 'createVariable': c.vars.set(op.name, { type: op.type, values: new Map() }); break;
      case 'setValue': {
        const v = c.vars.get(op.name); if (v) v.values.set(op.mode, { literal: op.value });
        break;
      }
      case 'setAlias': {
        const v = c.vars.get(op.name); if (v) v.values.set(op.mode, { alias: op.target });
        break;
      }
      default: break;
    }
  }
  return collections;
}

/* The same shape, read off a real Figma extract. */
function fromRawGraph(rawCollections) {
  const collections = new Map();
  const nameOf = {}, colOf = {};
  rawCollections.forEach((c) => c.variables.forEach((v) => { nameOf[v.id] = v.name; colOf[v.id] = c.name; }));
  for (const c of rawCollections) {
    const entry = { modes: c.modes.map((m) => m.name), vars: new Map() };
    const modeName = {};
    c.modes.forEach((m) => { modeName[m.modeId] = m.name; });
    for (const v of c.variables) {
      const values = new Map();
      for (const [mid, raw] of Object.entries(v.valuesByMode || {})) {
        const mn = modeName[mid];
        if (mn === undefined) continue;
        values.set(mn, raw && raw.type === 'VARIABLE_ALIAS'
          ? { alias: { collection: colOf[raw.id], name: nameOf[raw.id] } }
          : { literal: raw });
      }
      entry.vars.set(v.name, { type: v.resolvedType, values });
    }
    collections.set(c.name, entry);
  }
  return collections;
}

/* One canonical line per (collection, variable, mode). Sorted, so two states
   built in different orders still compare. */
function lines(state) {
  const out = [];
  for (const [cname, c] of state) {
    for (const [vname, v] of c.vars) {
      for (const [mode, val] of v.values) {
        const rendered = val.alias
          ? 'ALIAS:' + val.alias.collection + '/' + val.alias.name
          : fmtValue(val.literal);
        out.push(cname + '|' + vname + '|' + mode + '|' + rendered);
      }
    }
  }
  out.sort();
  return out;
}

/* FNV-1a. Not cryptographic and does not need to be — this identifies a
   mismatch, it does not defend against one. Inline so the same function runs
   on both sides and the algorithm can never be the difference (which it was,
   once, when one side used node's crypto and the other did not). */
function fingerprint(state) {
  const s = lines(state).join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/*
  compare(source, imported) — what the round trip did to each mode-value.

    matched   identical on both sides
    missing   the source had it and the round trip lost it     -> FAILURE
    changed   present on both, holding something else          -> FAILURE
    extra     the round trip invented it                       -> reported

  `ignoreCollections` drops collections the import deliberately did not carry
  (one over the target's mode ceiling, say) so a partial import can still be
  verified on the part it did do.
*/
function compare(source, imported, opts) {
  opts = opts || {};
  const skip = new Set(opts.ignoreCollections || []);
  const index = (state) => {
    const m = new Map();
    for (const l of lines(state)) {
      const i = l.lastIndexOf('|');
      m.set(l.slice(0, i), l.slice(i + 1));
    }
    return m;
  };
  /*
    A number may differ in its last places without anything having gone wrong:
    the EXPORTER rounds (62.285999 comes back as 62.286), so a difference below
    the tolerance is the exporter's precision, not the import's fidelity. It is
    still counted and reported — quietly folding it into `matched` would hide a
    real, if small, loss — but it does not fail closure.

    Default 0: a caller has to say out loud that it will accept imprecision.
  */
  const tol = opts.tolerance || 0;
  const nearly = (x, y) => {
    if (!tol) return false;
    const a = parseFloat(x), b = parseFloat(y);
    return isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol;
  };

  const a = index(source), b = index(imported);
  const res = { matched: 0, missing: [], changed: [], rounded: [], extra: [] };

  for (const [k, v] of a) {
    if (skip.has(k.split('|')[0])) continue;
    if (!b.has(k)) { res.missing.push(k); continue; }
    const got = b.get(k);
    if (got === v) { res.matched++; continue; }
    if (nearly(v, got)) { res.rounded.push({ key: k, source: v, imported: got }); continue; }
    res.changed.push({ key: k, source: v, imported: got });
  }
  for (const k of b.keys()) {
    if (skip.has(k.split('|')[0])) continue;
    if (!a.has(k)) res.extra.push(k);
  }

  res.closed = res.missing.length === 0 && res.changed.length === 0;
  return res;
}

module.exports = { materialise, fromRawGraph, lines, fingerprint, compare };
