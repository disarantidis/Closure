#!/usr/bin/env node
//
// import-plan.js — read a token JSON and print how it WOULD be projected onto
// Figma collections / modes / variables. Writes nothing, touches no Figma file.
//
//   node scripts/import-plan.js tokens.json
//   node scripts/import-plan.js tokens.json --ceiling 10
//   node scripts/import-plan.js tokens.json --json -o plan.json
//
// --ceiling is the target file's modes-per-collection limit (a property of that
// file's plan, not of the API). Without it no collection is reported blocked.
//
const fs = require('fs');
const { toIR, detect } = require('../src/import-ir.js');
const { derive } = require('../src/import-derive.js');

function parseArgs(argv) {
  const a = { input: null, ceiling: Infinity, json: false, out: null, format: null, limit: 8 };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--ceiling') a.ceiling = Number(argv[++i]);
    else if (x === '--json') a.json = true;
    else if (x === '-o' || x === '--out') a.out = argv[++i];
    else if (x === '--format') a.format = argv[++i];
    else if (x === '--limit') a.limit = Number(argv[++i]);
    else if (!a.input) a.input = x;
  }
  return a;
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

function print(plan, ir, limit) {
  const t = plan.totals;
  console.log('');
  console.log('  SOURCE  ' + plan.source + (plan.usedManifest ? '  (structure declared by $figmaStructure)' : '  (structure derived)'));
  console.log('  INPUT   ' + t.rows.toLocaleString() + ' tokens across ' + t.sets + ' sets');
  console.log('');

  console.log('  COLLECTIONS');
  console.log('  ' + pad('name', 22) + num('vars', 7) + '  ' + pad('modes', 7) + '  ' + pad('overlap', 9) + 'confidence');
  console.log('  ' + '-'.repeat(74));
  for (const c of plan.collections) {
    const flag = c.blocked ? '  << BLOCKED' : '';
    console.log('  ' + pad(c.name, 22) + num(c.variables.toLocaleString(), 7) + '  ' +
      pad(c.modes.length, 7) + '  ' +
      pad(c.overlap === null ? '-' : c.overlap + '%', 9) + c.confidence + flag);
  }
  console.log('');

  if (plan.ambiguous.length) {
    console.log('  !! AMBIGUOUS — these block the import and must be confirmed');
    for (const a of plan.ambiguous) {
      console.log('     ' + a.group + ': ' + a.variants.length + ' variants share ' +
        a.shared + ' of ' + a.of + ' paths (' + a.overlap + '%)');
      console.log('        modes of one collection, or ' + a.variants.length + ' separate collections? cannot be read from the file');
    }
    console.log('');
  }

  if (plan.blocked.length) {
    console.log('  BLOCKED BY MODE CEILING');
    for (const b of plan.blocked) {
      console.log('     ' + pad(b.collection, 20) + 'needs ' + b.needs + ' modes, target allows ' + b.ceiling);
    }
    console.log('');
  }

  console.log('  WHAT LANDS');
  console.log('     ' + num(t.literals.toLocaleString(), 9) + '  literal values');
  console.log('     ' + num(t.aliases.toLocaleString(), 9) + '  aliases');
  console.log('     ' + num((t.literals + t.aliases).toLocaleString(), 9) + '  mode-values total  (' + t.importablePct + '% of input)');
  console.log('     ' + num(t.variables.toLocaleString(), 9) + '  variables in ' + t.collections + ' collections');
  console.log('');

  const L = plan.losses;
  const any = L.composites.length || L.expressions.length || L.unresolvedRefs.length ||
              L.typeConflicts.length || L.emptyCollections.length || plan.refCollisions.length;
  if (any) {
    console.log('  WHAT DOES NOT');
    const show = (label, arr, fmt) => {
      if (!arr.length) return;
      console.log('     ' + num(arr.length.toLocaleString(), 9) + '  ' + label);
      arr.slice(0, limit).forEach((x) => console.log('                  ' + fmt(x)));
      if (arr.length > limit) console.log('                  … and ' + (arr.length - limit).toLocaleString() + ' more');
    };
    show('composites — not variables in Figma, need the styles API', L.composites,
      (x) => x.collection + '/' + x.path + '  (' + x.type + ')');
    show('expressions — evaluate to a literal, reference lost', L.expressions,
      (x) => x.collection + '/' + x.path + '  = ' + x.expr);
    show('unresolved references', L.unresolvedRefs,
      (x) => x.collection + '/' + x.path + ' -> {' + x.ref + '}  (' + x.reason + ')');
    show('type conflicts — one variable, two types across its modes', L.typeConflicts,
      (x) => x.collection + '/' + x.path + '  ' + x.types.join(' vs '));
    show('reference collisions — path defined in several collections', plan.refCollisions,
      (x) => '{' + x.path + '}  in ' + x.collections.join(', '));
    show('collections that would be empty', L.emptyCollections,
      (x) => x.name + '  (' + x.reason + ')');
    console.log('');
  }

  console.log('  VERDICT  ' + (plan.ok
    ? 'projection is unambiguous — safe to apply'
    : 'NEEDS CONFIRMATION — the file does not determine the projection on its own'));
  if (plan.blocked.length) {
    console.log('           partial: ' + plan.blocked.length + ' collection(s) exceed the mode ceiling');
  }
  console.log('');
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('usage: node scripts/import-plan.js <tokens.json> [--ceiling N] [--json] [-o plan.json]');
  process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const ir = toIR(doc, { format: args.format });
const plan = derive(ir, { modeCeiling: args.ceiling });

if (args.out) { fs.writeFileSync(args.out, JSON.stringify(plan, null, 2)); console.error('wrote ' + args.out); }
if (args.json) console.log(JSON.stringify(plan, null, 2));
else print(plan, ir, args.limit);

process.exit(plan.ok ? 0 : 2);
