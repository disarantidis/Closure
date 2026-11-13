#!/usr/bin/env node
//
// resolved-roundtrip.js — does a Resolved export come back as the file it came from?
//
//   node scripts/resolved-roundtrip.js graph.json resolved.json
//   node scripts/resolved-roundtrip.js graph.json resolved.json --show 20
//
// graph.json is the raw variable graph (Cmd/Ctrl+Shift+G in the plugin);
// resolved.json is the Resolved export of THAT file. The document is translated
// back (src/import-resolved.js), run through the same derive and compile the
// import page uses, interpreted into variables (materialise — no Figma is
// touched) and compared with the graph, value by value.
//
// Names are compared without regard to case (a Resolved export is lowercase) and
// numbers to 1e-3 (the export rounds). Everything else must be identical.
//
const fs = require('fs');
const path = require('path');
const R = require('../src/import-resolved.js');
const { derive } = require('../src/import-derive.js');
const { compile } = require('../src/import-compile.js');
const V = require('../src/import-verify.js');

const args = process.argv.slice(2);
const files = args.filter((a) => a.charAt(0) !== '-' && !/^\d+$/.test(a));
const show = args.indexOf('--show') !== -1 ? Number(args[args.indexOf('--show') + 1]) || 12 : 12;
if (files.length < 2) { console.error('usage: resolved-roundtrip.js graph.json resolved.json'); process.exit(2); }

const graphRaw = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const graph = Array.isArray(graphRaw) ? graphRaw : graphRaw.collections;
const doc = JSON.parse(fs.readFileSync(files[1], 'utf8'));

const t = R.translate(doc);
if (!t.ok) { console.error('REFUSED: ' + t.reason); process.exit(1); }
const plan = derive(t.ir, {});
const out = compile(t.ir, plan, { evaluateExpressions: true, collectionOrder: t.collectionOrder });
if (!out.ok) {
  console.error('COMPILE REFUSED');
  out.refusals.slice(0, 8).forEach((r) => console.error('  ' + r.kind + ': ' + r.question));
  process.exit(1);
}

const norm = (l) => {
  const p = l.split('|');
  let v = p.slice(3).join('|');
  if (/^-?\d+\.\d+$/.test(v)) v = String(Math.round(parseFloat(v) * 1e3) / 1e3);
  return [p[0], p[1].toLowerCase(), p[2].toLowerCase(), v.toLowerCase()].join('|');
};
// the verify module renders an alias as ALIAS:<collection>/<name>
const truth = V.lines(V.fromRawGraph(graph)).map(norm);
const built = V.lines(V.materialise(out.program)).map(norm);
const A = new Set(truth), B = new Set(built);
const missing = truth.filter((l) => !B.has(l)), extra = built.filter((l) => !A.has(l));
const byC = (ls) => { const c = {}; ls.forEach((l) => { const k = l.split('|')[0]; c[k] = (c[k] || 0) + 1; }); return c; };

console.log('architecture   ' + t.report.architecture + (t.report.declared ? '  (declared)' : '  (recognised)'));
console.log('collections    ' + out.stats.collections + '  modes ' + out.stats.modes + '  variables ' + out.stats.variables);
console.log('creation order ' + t.collectionOrder.join(', '));
console.log('scopes         from restore ' + t.report.scopes.restore + ', from rules ' + t.report.scopes.rules);
console.log('skipped        composites ' + t.report.skipped.composites + ', synthesized ' + t.report.skipped.synthesized);
console.log('unresolved     ' + (t.report.missing.length) + (t.report.missing.length ? '  e.g. ' + t.report.missing.slice(0, 3).join(' | ') : ''));
console.log('');
console.log('values in the file   ' + truth.length);
console.log('values rebuilt       ' + built.length);
console.log('identical            ' + (truth.length - missing.length) + '  (' + (100 * (truth.length - missing.length) / truth.length).toFixed(2) + '%)');
console.log('in the file only     ' + missing.length + '  ' + JSON.stringify(byC(missing)));
console.log('rebuilt only         ' + extra.length + '  ' + JSON.stringify(byC(extra)));
if (missing.length) console.log('\n  file:    ' + missing.slice(0, show).join('\n  file:    '));
if (extra.length) console.log('\n  rebuilt: ' + extra.slice(0, show).join('\n  rebuilt: '));

// scopes, against the file
const wanted = {};
graph.forEach((c) => c.variables.forEach((v) => { wanted[c.name + '|' + v.name.toLowerCase()] = (v.scopes || []).slice().sort().join(','); }));
let sOk = 0, sBad = 0; const sBadList = [];
out.program.ops.filter((o) => o.op === 'createVariable').forEach((o) => {
  const k = o.collection + '|' + o.name;
  const have = (o.scopes || null) === null ? null : o.scopes.slice().sort().join(',');
  if (have === wanted[k]) sOk++; else { sBad++; if (sBadList.length < 3) sBadList.push(k + ' want [' + wanted[k] + '] got [' + have + ']'); }
});
console.log('\nscopes identical ' + sOk + ' of ' + (sOk + sBad) + (sBad ? '   e.g. ' + sBadList.join(' | ') : ''));
process.exit(missing.length === 0 ? 0 : 3);
