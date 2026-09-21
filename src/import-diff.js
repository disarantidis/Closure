/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  DIFF — what would change if this JSON were applied to this document.

  The question a person actually asks before an import is not "is it valid" but
  "what is about to happen to my file". So this is the step that runs BEFORE
  anything is written, against a document that already has variables in it, and
  it answers in the document's own terms: what appears, what changes, what is
  left alone.

  IT IS compare() FROM import-verify.js, TURNED AROUND. That function exists to
  ask whether a round trip closed, so it calls the incoming side "imported" and
  anything only on that side "extra". Here the incoming side is a proposal and
  the existing side is the user's work, so the same four buckets mean something
  different and are named for what they are:

      added      in the JSON, not in the document      -> will be created
      changed    in both, holding different values     -> will be overwritten
      unchanged  in both, identical                    -> nothing happens
      untouched  in the document, not in the JSON      -> LEFT ALONE, not deleted

  THAT LAST ONE IS THE IMPORTANT PROMISE. An import adds and overwrites; it
  never deletes. A variable the JSON does not mention keeps whatever it holds.
  Saying so in the report is the difference between a person reading it as a
  merge and reading it as a replacement, and they are very different things to
  agree to.

  IT ALSO ROLLS UP. Thirty thousand changed values is not a report, it is a
  wall. The collection- and variable-level summaries are what someone actually
  reads; the per-value detail is there to drill into.
*/

  var __dep = (typeof require !== 'undefined')
    ? require('./import-verify.js')
    : global.PomImportVerify;
  var materialise = __dep.materialise;
  var fromRawGraph = __dep.fromRawGraph;
  var lines = __dep.lines;
/* "collection|variable|mode" -> rendered value */
function index(state) {
  const m = new Map();
  for (const l of lines(state)) {
    const i = l.lastIndexOf('|');
    m.set(l.slice(0, i), l.slice(i + 1));
  }
  return m;
}

const split = (key) => {
  const a = key.indexOf('|');
  const b = key.lastIndexOf('|');
  return { collection: key.slice(0, a), variable: key.slice(a + 1, b), mode: key.slice(b + 1) };
};

/*
  diff(existingRawGraph, program) -> report

  `existingRawGraph` is the document as extractVariables() gives it — the same
  shape import-verify.fromRawGraph() consumes. `program` is what compile()
  produced. Neither is modified and nothing is written.
*/
function diff(existingRawGraph, program) {
  const before = fromRawGraph(existingRawGraph || []);
  const after = materialise(program);

  const A = index(before), B = index(after);

  const report = {
    added: [], changed: [], untouched: [], unchangedCount: 0,
    collections: { added: [], touched: [], untouched: [] },
    modes: { added: [] },
    variables: { added: new Set(), changed: new Set() },
    summary: {},
  };

  for (const [k, v] of B) {
    if (!A.has(k)) { report.added.push({ key: k, value: v }); continue; }
    if (A.get(k) !== v) report.changed.push({ key: k, from: A.get(k), to: v });
    else report.unchangedCount++;
  }
  for (const k of A.keys()) if (!B.has(k)) report.untouched.push(k);

  /* Roll up to the levels a person reads at. */
  const beforeCols = new Set(before.keys());
  const afterCols = new Set(after.keys());
  for (const c of afterCols) {
    if (!beforeCols.has(c)) report.collections.added.push(c);
  }
  for (const c of beforeCols) if (!afterCols.has(c)) report.collections.untouched.push(c);

  const touched = new Set();
  report.added.forEach((x) => { const s = split(x.key); touched.add(s.collection); report.variables.added.add(s.collection + '|' + s.variable); });
  report.changed.forEach((x) => { const s = split(x.key); touched.add(s.collection); report.variables.changed.add(s.collection + '|' + s.variable); });
  report.collections.touched = [...touched].filter((c) => beforeCols.has(c));

  /* A mode the document does not have yet — worth naming separately, because
     adding one to an existing collection is a bigger deal than adding a
     variable to it, and it is what the mode ceiling is spent on. */
  for (const [cname, c] of after) {
    const existing = before.get(cname);
    if (!existing) continue;
    for (const m of c.modes) if (existing.modes.indexOf(m) === -1) report.modes.added.push(cname + ' / ' + m);
  }

  report.variables.added = [...report.variables.added];
  report.variables.changed = [...report.variables.changed];

  report.summary = {
    willCreateCollections: report.collections.added.length,
    willAddModes: report.modes.added.length,
    willCreateVariables: report.variables.added.length,
    willChangeVariables: report.variables.changed.length,
    valuesAdded: report.added.length,
    valuesChanged: report.changed.length,
    valuesUnchanged: report.unchangedCount,
    valuesLeftAlone: report.untouched.length,
    /* Nothing to do is a real and useful answer — it means the document
       already matches the file. */
    noop: report.added.length === 0 && report.changed.length === 0,
  };

  return report;
}

/* A short, readable rendering for a CLI or a panel. `limit` caps each list. */
function format(report, limit) {
  limit = limit || 10;
  const s = report.summary;
  const out = [];
  const push = (label, arr, fmt) => {
    if (!arr.length) return;
    out.push('  ' + String(arr.length).padStart(7) + '  ' + label);
    arr.slice(0, limit).forEach((x) => out.push('            ' + fmt(x)));
    if (arr.length > limit) out.push('            … and ' + (arr.length - limit).toLocaleString() + ' more');
  };

  if (s.noop) {
    out.push('  This document already matches the file — nothing would change.');
    return out.join('\n');
  }

  out.push('  WOULD CREATE');
  push('collection(s)', report.collections.added, (x) => x);
  push('mode(s) on an existing collection', report.modes.added, (x) => x);
  push('variable(s)', report.variables.added, (x) => x.replace('|', ' / '));
  out.push('');
  if (report.changed.length) {
    out.push('  WOULD OVERWRITE');
    push('value(s), in ' + report.variables.changed.length + ' existing variable(s)',
         report.changed, (x) => { const p = split(x.key); return p.collection + ' / ' + p.variable + ' [' + p.mode + ']  ' + x.from + '  ->  ' + x.to; });
    out.push('');
  }
  out.push('  WOULD LEAVE ALONE');
  out.push('  ' + String(s.valuesUnchanged).padStart(7) + '  value(s) already identical');
  out.push('  ' + String(s.valuesLeftAlone).padStart(7) + '  value(s) this file does not mention — an import never deletes');
  if (report.collections.untouched.length) {
    out.push('  ' + String(report.collections.untouched.length).padStart(7) + '  collection(s) untouched: ' +
             report.collections.untouched.slice(0, limit).join(', '));
  }
  return out.join('\n');
}

  var api = { diff, format };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportDiff = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
