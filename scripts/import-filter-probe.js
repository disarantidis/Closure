#!/usr/bin/env node
//
// import-filter-probe.js — what the op filter would save, on real files.
//
//   node scripts/import-filter-probe.js <figma-side.json> <repo-side.json>
//
// The first file stands in for the document: it is compiled and applied to an
// empty stand-in, which is exactly what a Figma file exported from this plugin
// would hold. The second is the file you would push. Nothing is written
// anywhere and no Figma is involved.
//
const fs = require('fs');
const { toIR } = require('../src/import-ir.js');
const { derive } = require('../src/import-derive.js');
const { compile } = require('../src/import-compile.js');
const { fromRawGraph, fingerprint } = require('../src/import-verify.js');
const { apply } = require('../src/import-apply.js');
const { reduce } = require('../src/import-filter.js');

/* The same stand-in the suite uses, kept here rather than imported so the
   probe can be run against a checkout that has no dev dependencies. */
function mockFigma() {
  let seq = 0; const made = [];
  const F = { collections: made };
  F.variables = {
    createVariableCollection(name) {
      const col = { id: 'c' + ++seq, name, vars: [], modes: [{ modeId: 'm' + ++seq, name: 'Mode 1' }],
        get defaultModeId() { return this.modes[0].modeId; },
        renameMode(id, n) { this.modes.find((m) => m.modeId === id).name = n; },
        addMode(n) { const id = 'm' + ++seq; this.modes.push({ modeId: id, name: n }); return id; } };
      made.push(col); return col;
    },
    createVariable(name, col, type) {
      const v = { id: 'v' + ++seq, name, resolvedType: type, description: '', scopes: [], valuesByMode: {},
                  setValueForMode(mid, val) { this.valuesByMode[mid] = val; } };
      col.vars.push(v); return v;
    },
    createVariableAlias(v) { return { type: 'VARIABLE_ALIAS', id: v.id }; },
  };
  F.toRawGraph = () => made.map((c) => ({ id: c.id, name: c.name, defaultModeId: c.defaultModeId,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.vars.map((v) => ({ id: v.id, name: v.name, resolvedType: v.resolvedType,
                                    valuesByMode: v.valuesByMode })) }));
  F.snapshot = () => made.map((c) => ({ name: c.name, handle: c,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.vars.map((v) => ({ name: v.name, handle: v })) }));
  return F;
}

function programOf(path) {
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  if (!c.ok) {
    console.error(path + ': compile refused — ' + (c.questions || []).length + ' question(s) unanswered');
    (c.questions || []).slice(0, 5).forEach((q) => console.error('   ' + (q.message || q.id)));
    if (!c.program || !c.program.ops.length) process.exit(1);
  }
  return c.program;
}

const [figmaSide, repoSide] = process.argv.slice(2);
if (!figmaSide || !repoSide) {
  console.error('usage: node scripts/import-filter-probe.js <figma-side.json> <repo-side.json>');
  process.exit(2);
}

const n = (x) => x.toLocaleString();
const valueOps = (p) => p.ops.filter((o) => o.op === 'setValue' || o.op === 'setAlias').length;

const doc = mockFigma();
apply(programOf(figmaSide), doc, {});
const before = fingerprint(fromRawGraph(doc.toRawGraph()));

const full = programOf(repoSide);
const cut = reduce(full, doc.toRawGraph());

console.log('');
console.log('  document      ' + n(doc.collections.length) + ' collection(s), ' +
            n(doc.collections.reduce((a, c) => a + c.vars.length, 0)) + ' variable(s)');
console.log('  whole program ' + n(full.ops.length) + ' ops, ' + n(valueOps(full)) + ' of them values');
console.log('  filtered      ' + n(cut.program.ops.length) + ' ops, ' + n(cut.stats.values) + ' of them values');
console.log('');
console.log('  what moves    ' + n(cut.report.summary.valuesAdded) + ' new, ' +
            n(cut.report.summary.valuesChanged) + ' changed, ' +
            n(cut.report.summary.valuesUnchanged) + ' already identical');
console.log('                ' + n(cut.report.summary.valuesLeftAlone) +
            ' in the document this file never mentions — left alone');
console.log('');

/* The claim, checked rather than asserted: both runs land on one document. */
const A = mockFigma(); apply(programOf(figmaSide), A, {});
apply(full, A, { existing: A.snapshot() });
const B = mockFigma(); apply(programOf(figmaSide), B, {});
apply(cut.program, B, { existing: B.snapshot() });
const same = fingerprint(fromRawGraph(A.toRawGraph())) === fingerprint(fromRawGraph(B.toRawGraph()));
console.log('  same result   ' + (same ? 'yes' : 'NO — the filter changed the outcome'));
console.log('  saved         ' + n(valueOps(full) - cut.stats.values) + ' value writes (' +
            (valueOps(full) ? Math.round(100 - (cut.stats.values / valueOps(full)) * 100) : 0) + '%)');
console.log('  document was  ' + (before === fingerprint(fromRawGraph(doc.toRawGraph())) ? 'not touched by the probe' : 'MUTATED — bug'));
console.log('');
if (!same) process.exit(1);
