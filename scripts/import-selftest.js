#!/usr/bin/env node
//
// import-selftest.js — the import pipeline's own suite. No Figma, no network.
//
// Most of these assert a REFUSAL rather than a result. That is the point: the
// failure mode this pipeline is built against is a wrong projection applied
// silently, so the tests that matter most are the ones proving it stops.
//
const { toIR, detect } = require('../src/import-ir.js');
const { derive } = require('../src/import-derive.js');
const { compile, toColor, evaluate } = require('../src/import-compile.js');
const { buildManifest, bindManifest } = require('../src/import-manifest.js');
const { materialise, fromRawGraph, compare, fingerprint } = require('../src/import-verify.js');
const { apply, preflight } = require('../src/import-apply.js');
const { diff, format } = require('../src/import-diff.js');

/* A Figma stand-in with the same surface apply() uses, recording what it was
   told to do. Enough to assert the call sequence and to read the result back
   in the shape fromRawGraph() produces, which is what lets apply() be compared
   against materialise() directly. */
function mockFigma(fail) {
  let seq = 0;
  const made = [];
  const calls = [];
  const F = { calls, collections: made, variables: [] };
  F.variables = {
    createVariableCollection(name) {
      calls.push('createVariableCollection:' + name);
      if (fail === 'collection') throw new Error('mock refused the collection');
      const col = {
        id: 'c' + ++seq, name, vars: [],
        modes: [{ modeId: 'm' + ++seq, name: 'Mode 1' }],
        get defaultModeId() { return this.modes[0].modeId; },
        renameMode(id, n) { calls.push('renameMode:' + n); this.modes.find((m) => m.modeId === id).name = n; },
        addMode(n) {
          calls.push('addMode:' + n);
          if (fail === 'mode' && this.modes.length >= 2) throw new Error('Limited to 2 modes only');
          const id = 'm' + ++seq; this.modes.push({ modeId: id, name: n }); return id;
        },
        remove() { calls.push('remove:' + this.name); const i = made.indexOf(this); if (i >= 0) made.splice(i, 1); },
      };
      made.push(col); return col;
    },
    createVariable(name, col, type) {
      calls.push('createVariable:' + col.name + '/' + name);
      if (fail === 'variable') throw new Error('mock refused the variable');
      const v = { id: 'v' + ++seq, name, resolvedType: type, description: '', scopes: [],
                  valuesByMode: {},
                  setValueForMode(mid, val) { this.valuesByMode[mid] = val; } };
      col.vars.push(v); return v;
    },
    createVariableAlias(v) { return { type: 'VARIABLE_ALIAS', id: v.id }; },
    getLocalVariableCollectionsAsync: async () => made.slice(),
  };
  /* The same shape fromRawGraph() consumes, so a mock run can be compared with
     materialise() on equal terms. */
  F.toRawGraph = () => made.map((c) => ({
    id: c.id, name: c.name, defaultModeId: c.defaultModeId,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.vars.map((v) => ({ id: v.id, name: v.name, resolvedType: v.resolvedType,
                                    valuesByMode: v.valuesByMode })),
  }));
  return F;
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('ok    ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n        ' + detail : '')); }
}
const tok = (value, type) => ({ value, type: type || 'color' });
const run = (doc, opts) => { const ir = toIR(doc); return { ir, plan: derive(ir, opts) }; };

/* ── adapters ─────────────────────────────────────────────────────────────── */
{
  const doc = { $metadata: { tokenSetOrder: ['a'] }, a: { x: tok('#fff') } };
  ok('detect: legacy by $metadata', detect(doc) === 'legacy');
}
{
  const doc = { core: { red: { $value: '#f00', $type: 'color' } } };
  ok('detect: dtcg by $value', detect(doc) === 'dtcg');
  const ir = toIR(doc);
  ok('dtcg: top-level group stays in the path (refs name it)',
     ir.rows[0].path === 'core.red', 'got ' + ir.rows[0].path);
}
{
  const doc = { $metadata: { tokenSetOrder: ['mode/light'] }, 'mode/light': { brand: { primary: tok('#fff') } } };
  const ir = toIR(doc);
  ok('legacy: set name is NOT part of the path',
     ir.rows[0].path === 'brand.primary' && ir.rows[0].group === 'mode' && ir.rows[0].variant === 'light',
     JSON.stringify(ir.rows[0]));
}
{
  /* A legacy document without $metadata: its top-level keys ARE its sets, so
     "colour" becomes a collection. That is the Tokens Studio reading and the
     right one — fromFlat is for a document with no token sets at all, which is
     reachable only by asking for it. */
  const ir = toIR({ colour: { red: tok('#f00') } });
  ok('legacy without $metadata: top-level keys are sets',
     ir.source === 'legacy' && ir.rows[0].group === 'colour' && ir.rows[0].path === 'red',
     JSON.stringify(ir.rows[0]));
  const flat = toIR({ colour: { red: tok('#f00') }, size: { s: tok(4, 'dimension') } }, { format: 'flat' });
  ok('flat: one group, and the top-level key stays in the path',
     flat.source === 'flat' && flat.rows.length === 2 && flat.rows[0].path === 'colour.red',
     JSON.stringify(flat.rows.map((r) => r.path)));
}

/* ── the group verdict ───────────────────────────────────────────────────── */
{
  const { plan } = run({ $metadata: { tokenSetOrder: ['m/light', 'm/dark'] },
    'm/light': { a: { b: tok('#111') } }, 'm/dark': { a: { b: tok('#222') } } });
  ok('verdict: identical paths -> modes of one collection',
     plan.collections.length === 1 && plan.collections[0].modes.length === 2);
}
{
  const { plan } = run({ $metadata: { tokenSetOrder: ['base/white', 'base/black'] },
    'base/white': { white: { bg: tok('#fff') } }, 'base/black': { black: { bg: tok('#000') } } });
  ok('verdict: disjoint paths -> separate collections',
     plan.collections.length === 2 && plan.collections.every((c) => c.modes.length === 1),
     JSON.stringify(plan.collections.map((c) => c.name + ':' + c.modes.length)));
}

/* ── refusals: the ones that matter ──────────────────────────────────────── */
{
  const { ir, plan } = run({ $metadata: { tokenSetOrder: ['t/a', 't/b', 't/c'] },
    't/a': { s: { x: tok('#1'), y: tok('#2') }, only: { a: tok('#3') } },
    't/b': { s: { x: tok('#4'), y: tok('#5') }, only: { b: tok('#6') } },
    't/c': { s: { x: tok('#7') }, only: { c: tok('#8') } } });
  ok('refuse: partial overlap is ambiguous', plan.ok === false && plan.ambiguous.length === 1);
  ok('refuse: the question carries an id and options',
     plan.unresolved[0].id === 'group:t' &&
     plan.unresolved[0].options.join(',') === 'modes,separate');
  const c = compile(ir, plan, {});
  ok('GATE: compile refuses an ambiguous plan', c.ok === false && c.program === null);
  ok('GATE: refusal names what must be answered', c.refusals[0].id === 'group:t');
}
{
  const { ir, plan } = run({ $metadata: { tokenSetOrder: ['m/light', 'm/dark'] },
    'm/light': { a: { b: tok('#111', 'color') } }, 'm/dark': { a: { b: tok(4, 'dimension') } } });
  ok('refuse: one variable with two types', plan.ok === false && plan.losses.typeConflicts.length === 1);
  ok('GATE: compile refuses a type conflict', compile(ir, plan, {}).ok === false);
}
{
  const { ir, plan } = run({ $metadata: { tokenSetOrder: ['one', 'two', 'uses'] },
    one: { sh: { c: tok('#111') } }, two: { sh: { c: tok('#222') } }, uses: { x: tok('{sh.c}') } });
  ok('refuse: a REFERENCED path defined in two collections',
     plan.ok === false && plan.refCollisions.length === 1);
  ok('GATE: compile refuses a reference collision', compile(ir, plan, {}).ok === false);

  const quiet = run({ $metadata: { tokenSetOrder: ['one', 'two'] },
    one: { sh: { c: tok('#111') } }, two: { sh: { c: tok('#222') } } });
  ok('allow: the same duplicate with nothing pointing at it is not a question',
     quiet.plan.ok === true && quiet.plan.refCollisions.length === 0);

  const decided = derive(ir, { decisions: { 'ref:sh.c': 'two' } });
  ok('decision: picks which collection a colliding reference means', decided.ok === true);
}

/* ── decisions are the only way through ──────────────────────────────────── */
{
  const doc = { $metadata: { tokenSetOrder: ['t/a', 't/b', 't/c'] },
    't/a': { s: { x: tok('#111111'), y: tok('#222222') }, only: { a: tok('#333333') } },
    't/b': { s: { x: tok('#444444'), y: tok('#555555') }, only: { b: tok('#666666') } },
    't/c': { s: { x: tok('#777777') }, only: { c: tok('#888888') } } };
  const ir = toIR(doc);
  const plan = derive(ir, { decisions: { 'group:t': 'separate' } });
  ok('decision: resolves the ambiguity', plan.ok === true && plan.ambiguous.length === 0);
  ok('decision: is recorded on the plan',
     plan.decisionsApplied.length === 1 && plan.decisionsApplied[0].id === 'group:t');
  ok('decision: "separate" yields one collection per variant', plan.collections.length === 3);
  const c = compile(ir, plan, {});
  ok('GATE: compile accepts once answered', c.ok === true && c.program.ops.length > 0);
  ok('manifest: carries the decision forward',
     c.manifest.decisions.length === 1 && c.manifest.collections.length === 3);
}
{
  const doc = { $metadata: { tokenSetOrder: ['m/light', 'm/dark'] },
    'm/light': { a: { b: tok('#111111', 'color') } }, 'm/dark': { a: { b: tok(4, 'dimension') } } };
  const ir = toIR(doc);
  const plan = derive(ir, { decisions: { 'type:m/a.b': 'FLOAT' } });
  ok('decision: resolves a type conflict', plan.ok === true);
}

/* ── $figmaStructure: a declaration beats a measurement ──────────────────── */
{
  /* The exporter strips the leading dot and renames as it goes, so a round
     trip WITHOUT the manifest cannot give ".core" back — the information is
     not in the JSON. With it, it can. */
  const doc = { $metadata: { tokenSetOrder: ['core', 'mode/light', 'mode/dark'] },
    core: { red: tok('#ff0000') },
    'mode/light': { bg: tok('{red}') }, 'mode/dark': { bg: tok('#330000') },
    $figmaStructure: { version: 1, collections: [
      { figmaName: '.core', modes: ['.core'] },
      { figmaName: '.mode', modes: ['light', 'dark'] },
    ] } };
  const ir = toIR(doc);
  ok('manifest: survives the adapter', !!ir.manifest);

  const bare = derive(toIR({ $metadata: doc.$metadata, core: doc.core,
    'mode/light': doc['mode/light'], 'mode/dark': doc['mode/dark'] }), {});
  ok('without manifest: the leading dot is gone',
     bare.collections.map((c) => c.name).sort().join(',') === 'core,mode');

  const plan = derive(ir, {});
  ok('with manifest: the real Figma names come back',
     plan.usedManifest === true &&
     plan.collections.map((c) => c.name).sort().join(',') === '.core,.mode',
     plan.collections.map((c) => c.name).join(','));
  ok('with manifest: it is reported as declared, not measured',
     plan.collections.every((c) => c.confidence === 'declared'));
}
{
  /* A manifest naming nothing in the document is stale, and a stale
     declaration that overrode a live measurement would be worse than none. */
  const doc = { $metadata: { tokenSetOrder: ['a', 'b'] },
    a: { x: tok('#111111') }, b: { y: tok('#222222') },
    $figmaStructure: { version: 1, collections: [
      { figmaName: 'something-else', modes: ['nope'] } ] } };
  const plan = derive(toIR(doc), {});
  ok('manifest: one that matches nothing is ignored', plan.usedManifest === false);
}
{
  /* Bound per group: a hand-added set falls through to measurement without
     invalidating the declaration for everything else. */
  const doc = { $metadata: { tokenSetOrder: ['mode/light', 'mode/dark', 'extra'] },
    'mode/light': { bg: tok('#111111') }, 'mode/dark': { bg: tok('#222222') },
    extra: { z: tok('#333333') },
    $figmaStructure: { version: 1, collections: [{ figmaName: '.mode', modes: ['light', 'dark'] }] } };
  const plan = derive(toIR(doc), {});
  ok('manifest: binds per group, measures the rest',
     plan.usedManifest === true && plan.manifestBinding.bound === 1 &&
     plan.manifestBinding.measured === 1 &&
     plan.collections.some((c) => c.name === '.mode') &&
     plan.collections.some((c) => c.name === 'extra'),
     JSON.stringify(plan.collections.map((c) => c.name)));
}
{
  /* The declaration answers what measurement would have had to ask about. */
  const doc = { $metadata: { tokenSetOrder: ['t/a', 't/b', 't/c'] },
    't/a': { s: { x: tok('#111111'), y: tok('#222222') }, only: { a: tok('#333333') } },
    't/b': { s: { x: tok('#444444'), y: tok('#555555') }, only: { b: tok('#666666') } },
    't/c': { s: { x: tok('#777777') }, only: { c: tok('#888888') } },
    $figmaStructure: { version: 1, collections: [{ figmaName: '.theme', modes: ['a', 'b', 'c'] }] } };
  const plan = derive(toIR(doc), {});
  ok('manifest: settles a group measurement would have refused',
     plan.ok === true && plan.ambiguous.length === 0 && plan.collections[0].name === '.theme');
  const ignored = derive(toIR(doc), { ignoreManifest: true });
  ok('manifest: ignoreManifest puts the question back', ignored.ok === false);
}
{
  /* The exporter renames collections AND their modes, so the name is the less
     reliable half of the pair — matched by mode-set, then positionally. */
  const doc = { $metadata: { tokenSetOrder: ['restrictions/open', 'restrictions/closed'] },
    'restrictions/open': { a: tok('#111111') }, 'restrictions/closed': { a: tok('#222222') },
    $figmaStructure: { version: 1, collections: [
      { figmaName: '_restricted', modes: ['open', 'closed'] } ] } };
  const plan = derive(toIR(doc), {});
  ok('manifest: binds by modes when the collection was renamed',
     plan.collections[0].name === '_restricted', plan.collections[0].name);

  const renamedModes = { $metadata: { tokenSetOrder: ['bp/mobile', 'bp/tablet'] },
    'bp/mobile': { a: tok('#111111') }, 'bp/tablet': { a: tok('#222222') },
    $figmaStructure: { version: 1, collections: [
      { figmaName: '.bp', modes: ['S Mobile', 'M Tablet'] } ] } };
  const p2 = derive(toIR(renamedModes), {});
  ok('manifest: binds positionally when the mode names were rewritten too',
     p2.collections[0].name === '.bp' &&
     p2.collections[0].modes.join(',') === 'S Mobile,M Tablet',
     JSON.stringify(p2.collections[0]));
}
{
  const built = buildManifest([{ name: '.core', modes: [{ name: '.core' }], variables: [1, 2] }]);
  ok('buildManifest: shapes what the export writes',
     built.version === 1 && built.collections[0].figmaName === '.core' &&
     built.collections[0].variables === 2);
  ok('buildManifest: nothing to declare -> nothing declared', buildManifest([]) === null);
  ok('bindManifest: absent manifest binds nothing',
     bindManifest({ rows: [] }, null) === null);
}

/* ── the program ─────────────────────────────────────────────────────────── */
{
  const doc = { $metadata: { tokenSetOrder: ['core', 'mode/light', 'mode/dark'] },
    core: { red: tok('#ff0000') },
    'mode/light': { bg: tok('{red}') },
    'mode/dark': { bg: tok('{red}') } };
  const ir = toIR(doc);
  const plan = derive(ir, {});
  const c = compile(ir, plan, {});
  ok('program: compiles', c.ok === true);
  const ops = c.program.ops.map((o) => o.op);
  ok('program: first mode is a RENAME, never an extra addMode',
     ops.indexOf('createCollection') === 0 &&
     c.program.ops.filter((o) => o.op === 'addMode').length === 1,
     ops.join(','));
  const lastCreate = ops.lastIndexOf('createVariable');
  const firstAlias = ops.indexOf('setAlias');
  ok('program: every alias comes after every createVariable',
     firstAlias > lastCreate, 'lastCreate=' + lastCreate + ' firstAlias=' + firstAlias);
  ok('program: alias names its target by collection and name',
     c.program.ops.filter((o) => o.op === 'setAlias')
       .every((o) => o.target && o.target.collection === 'core' && o.target.name === 'red'));
  ok('program: colour became 0..1 rgba',
     c.program.ops.some((o) => o.op === 'setValue' && o.value && o.value.r === 1 && o.value.g === 0));
}

/* ── partial imports are opt-in ──────────────────────────────────────────── */
{
  const sets = {}; const order = [];
  for (let i = 0; i < 12; i++) { const n = 'wide/v' + i; order.push(n); sets[n] = { a: { b: tok('#' + i + i + i) } }; }
  const doc = Object.assign({ $metadata: { tokenSetOrder: order } }, sets);
  const ir = toIR(doc);
  const plan = derive(ir, { modeCeiling: 10 });
  ok('ceiling: a too-wide collection is blocked, not ambiguous',
     plan.blocked.length === 1 && plan.ok === true);
  ok('GATE: compile refuses a partial import by default', compile(ir, plan, {}).ok === false);
  const c = compile(ir, plan, { allowPartial: true });
  ok('GATE: allowPartial drops it and proceeds',
     c.ok === true && !c.program.ops.some((o) => o.collection === 'wide'));
}

/* ── expressions are opt-in and reported as lossy ────────────────────────── */
{
  /* base as a STRING on purpose — that is how the exporter writes numbers, and
     an evaluator that only accepted a JS number skipped every expression in a
     real file because of it. */
  const doc = { $metadata: { tokenSetOrder: ['core'] },
    core: { base: tok('4', 'dimension'), step: tok('3*{base}', 'dimension') } };
  const ir = toIR(doc);
  const plan = derive(ir, {});
  ok('expression: reported as a loss', plan.losses.expressions.length === 1);
  const off = compile(ir, plan, {});
  /* With evaluation off, "step" has no value it could ever hold — so it is not
     created empty, it is not created at all. The plan still reports WHY. */
  ok('expression: without evaluation the variable is dropped, not created empty',
     off.stats.skippedEmpty === 1 &&
     !off.program.ops.some((o) => o.op === 'createVariable' && o.name === 'step'),
     JSON.stringify(off.stats));
  ok('expression: and the reason is still on the plan',
     plan.losses.expressions.length === 1 && /3\*\{base\}/.test(plan.losses.expressions[0].expr));
  const on = compile(ir, plan, { evaluateExpressions: true });
  const ev = on.program.ops.filter((o) => o.op === 'setValue' && o.note);
  ok('expression: evaluated on request, and says the reference was lost',
     ev.length === 1 && ev[0].value === 12 && /reference lost/.test(ev[0].note),
     JSON.stringify(ev));
}

/* ── value coercion ──────────────────────────────────────────────────────── */
{
  ok('colour: 8-digit hex carries alpha', Math.abs(toColor('#0000001f').a - 31 / 255) < 1e-9);
  ok('colour: 3-digit hex expands', toColor('#f00').r === 1);
  /* Found by the gate on a real export: 19 rgba() among 374 hex. */
  ok('colour: rgba() with fractional alpha',
     (() => { const c = toColor('rgba(0,0,0,0.4)'); return c && c.r === 0 && Math.abs(c.a - 0.4) < 1e-9; })());
  ok('colour: rgb() defaults alpha to 1',
     (() => { const c = toColor('rgb(255, 128, 0)'); return c && c.r === 1 && Math.abs(c.g - 128 / 255) < 1e-9 && c.a === 1; })());
  ok('colour: percentage channels and space/slash syntax',
     (() => { const c = toColor('rgb(100% 0% 0% / 50%)'); return c && c.r === 1 && c.b === 0 && Math.abs(c.a - 0.5) < 1e-9; })());
  ok('colour: nonsense is refused, not guessed', toColor('rebeccapurple') === null);
  ok('colour: a malformed rgba() is refused', toColor('rgba(0,0)') === null);
  ok('expression: arithmetic only, no code', evaluate('{x}+process', { _internals: { vars: new Map() } }) === null);

  /* Also found by the gate: the exporter writes "100%" where the source file
     stores the number 100, so stripping the unit restores it rather than
     guessing at it. */
  const { coerce } = require('../src/import-compile.js');
  ok('float: a unit is stripped and reported', (() => {
    const c = coerce('FLOAT', '100%'); return c.ok && c.value === 100 && c.unit === '%';
  })());
  ok('float: negative and fractional with a unit', (() => {
    const c = coerce('FLOAT', '-2.5%'); return c.ok && c.value === -2.5;
  })());
  ok('float: 0px', (() => { const c = coerce('FLOAT', '0px'); return c.ok && c.value === 0; })());
  ok('float: a plain number is untouched and carries no unit', (() => {
    const c = coerce('FLOAT', 4); return c.ok && c.value === 4 && c.unit === undefined;
  })());
  ok('float: genuine nonsense is still refused', coerce('FLOAT', 'thick').ok === false);
}
{
  /* One variable, two units across its modes — no single unitless number means
     both, so it is refused rather than silently flattened. */
  const doc = { $metadata: { tokenSetOrder: ['m/a', 'm/b'] },
    'm/a': { x: tok('10px', 'dimension') }, 'm/b': { x: tok('10%', 'dimension') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  ok('GATE: refuses a variable whose modes disagree about the unit',
     c.ok === false && c.refusals.some((r) => r.kind === 'unit'), JSON.stringify(c.refusals));
}


/* ── STRUCTURAL CLOSURE against real data ────────────────────────────────────
   Closure already checks that every {ref} in an export has a target inside it.
   This is that idea one level up: does Figma -> export -> import put back what
   it took out?

   The two fixtures are a real slice of a real 7,984-variable system — the
   variable graph exactly as Figma gave it, and the Legacy JSON this exporter
   produced from it. No Figma is needed to check them: a compiled program
   already describes exhaustively what Figma WOULD hold, so materialise()
   interprets it and the two are compared as data.

   This is the test that catches what counting cannot. On the full system it
   found 24 values that came back materially wrong — every name, every count
   and every collection still lined up perfectly, because the expression
   evaluator was resolving references in the wrong MODE and handing every
   breakpoint the mobile answer. */
{
  const rawGraph = require('./__fixtures__/roundtrip-figma.json');
  const exported = require('./__fixtures__/roundtrip-export.json');

  const source = fromRawGraph(rawGraph);
  const ir = toIR(exported);
  const plan = derive(ir, {});
  ok('closure: the export carries its own structure', plan.usedManifest === true);
  ok('closure: and the real Figma names come back',
     ['.core', '.white', '.black'].every((n) => plan.collections.some((c) => c.name === n)),
     plan.collections.map((c) => c.name).join(','));

  const c = compile(ir, plan, { evaluateExpressions: true });
  ok('closure: the plan compiles', c.ok === true, JSON.stringify((c.refusals || []).slice(0, 2)));

  const r = compare(source, materialise(c.program), { tolerance: 1e-3 });
  ok('CLOSURE: nothing the source had was lost',
     r.missing.length === 0, 'missing: ' + r.missing.slice(0, 4).join('  '));
  ok('CLOSURE: nothing came back holding a different value',
     r.changed.length === 0,
     r.changed.slice(0, 4).map((x) => x.key + ' ' + x.source + ' -> ' + x.imported).join('  '));
  ok('CLOSURE: the round trip closes', r.closed === true);
  ok('closure: and it actually compared something', r.matched > 20, 'matched ' + r.matched);
  /* Extras are the exporter inventing primitives that were never variables —
     textCase/none and friends. Expected, and reported rather than ignored. */
  ok('closure: extras are the exporter\'s own invented primitives',
     r.extra.length > 0 && r.extra.every((k) => /letterSpacing|textCase|textDecoration|lineHeights|paragraph|foundation/.test(k)),
     r.extra.slice(0, 4).join('  '));
}
{
  /* The comparison has to be able to FAIL, or it proves nothing. */
  const a = materialise({ ops: [
    { op: 'createCollection', collection: 'c', firstMode: 'm' },
    { op: 'createVariable', collection: 'c', name: 'x', type: 'FLOAT' },
    { op: 'setValue', collection: 'c', name: 'x', mode: 'm', value: 1 } ] });
  const b = materialise({ ops: [
    { op: 'createCollection', collection: 'c', firstMode: 'm' },
    { op: 'createVariable', collection: 'c', name: 'x', type: 'FLOAT' },
    { op: 'setValue', collection: 'c', name: 'x', mode: 'm', value: 2 } ] });
  const empty = materialise({ ops: [] });
  ok('compare: a changed value fails closure', compare(a, b).closed === false);
  ok('compare: a missing value fails closure',
     (() => { const r = compare(a, empty); return r.closed === false && r.missing.length === 1; })());
  ok('compare: an extra value does NOT fail closure',
     (() => { const r = compare(empty, a); return r.closed === true && r.extra.length === 1; })());
  ok('compare: tolerance moves a near-miss out of changed and into rounded',
     (() => {
       const x = materialise({ ops: [
         { op: 'createCollection', collection: 'c', firstMode: 'm' },
         { op: 'createVariable', collection: 'c', name: 'x', type: 'FLOAT' },
         /* Between the 6dp the fingerprint itself rounds to and the 1e-3
            tolerance — a smaller gap would be erased before compare() saw it. */
         { op: 'setValue', collection: 'c', name: 'x', mode: 'm', value: 1.0004 } ] });
       const strict = compare(a, x);
       const loose = compare(a, x, { tolerance: 1e-3 });
       return strict.changed.length === 1 && loose.changed.length === 0 && loose.rounded.length === 1;
     })());
  ok('fingerprint: differs when the content does', fingerprint(a) !== fingerprint(b));
  ok('fingerprint: is stable for the same content', fingerprint(a) === fingerprint(a));
}

/* ── no variable is created that will never hold anything ────────────────── */
{
  /* Found by asking what apply() would WRITE rather than what compile()
     produced: a real slice created 193 variables and gave values to 48. The
     other 145 were typography sub-values referencing tokens the document does
     not contain, and Figma would have filled every one with a type default
     that looks like a real token. */
  const doc = { $metadata: { tokenSetOrder: ['core', 'ghost'] },
    core: { red: tok('#ff0000') },
    ghost: { a: tok('{does.not.exist}'), b: tok('{also.missing}') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const created = c.program.ops.filter((o) => o.op === 'createVariable').map((o) => o.collection + '/' + o.name);
  const valued = new Set(c.program.ops.filter((o) => o.op === 'setValue' || o.op === 'setAlias')
                          .map((o) => o.collection + '/' + o.name));
  ok('empty: every variable created is given a value',
     created.length > 0 && created.every((k) => valued.has(k)), created.join(','));
  ok('empty: a collection left with nothing is not created either',
     !c.program.ops.some((o) => o.op === 'createCollection' && o.collection === 'ghost') &&
     c.stats.skippedEmptyCollections.indexOf('ghost') !== -1,
     JSON.stringify(c.stats.skippedEmptyCollections));
}
{
  /* Dropping is a FIXPOINT: an alias whose target was dropped has nothing left
     to point at, so it goes too — a -> b -> (missing) must remove both. */
  const doc = { $metadata: { tokenSetOrder: ['s'] },
    s: { a: tok('{s2.b}'), } };
  const doc2 = { $metadata: { tokenSetOrder: ['one', 'two'] },
    one: { b: tok('{nowhere}') },
    two: { a: tok('{b}') } };
  const ir = toIR(doc2);
  const c = compile(ir, derive(ir, {}), {});
  ok('empty: the drop cascades through aliases',
     c.program.ops.filter((o) => o.op === 'createVariable').length === 0,
     JSON.stringify(c.program.ops.map((o) => o.op + ':' + (o.name || o.collection))));
}

/* ── diff(): what would change, before anything is written ──────────────── */
{
  /* The strongest test available: a file's OWN export, diffed back against it.
     Everything should already match, and whatever does not is a statement
     about the exporter rather than the import. */
  const rawGraph = require('./__fixtures__/roundtrip-figma.json');
  const ir = toIR(require('./__fixtures__/roundtrip-export.json'));
  const c = compile(ir, derive(ir, {}), { evaluateExpressions: true });
  const r = diff(rawGraph, c.program);

  ok('diff: an export of this file creates no new collections',
     r.collections.added.length === 0, r.collections.added.join(','));
  ok('diff: and adds no modes', r.modes.added.length === 0, r.modes.added.join(','));
  ok('diff: and overwrites nothing',
     r.changed.length === 0, JSON.stringify(r.changed.slice(0, 3)));
  ok('diff: almost everything is already identical',
     r.summary.valuesUnchanged > 20, 'unchanged ' + r.summary.valuesUnchanged);
  ok('diff: the only additions are the primitives the exporter invents',
     r.variables.added.length > 0 &&
     r.variables.added.every((k) => /letterSpacing|textCase|textDecoration|lineHeights/.test(k)),
     r.variables.added.slice(0, 3).join('  '));
}
{
  /* Against an EMPTY document everything is an addition and nothing is a
     change — the case the plugin's empty state offers. */
  const ir = toIR(require('./__fixtures__/roundtrip-export.json'));
  const c = compile(ir, derive(ir, {}), { evaluateExpressions: true });
  const r = diff([], c.program);
  ok('diff: against an empty document, everything is new',
     r.changed.length === 0 && r.untouched.length === 0 &&
     r.collections.added.length === 3 && r.added.length === 48,
     JSON.stringify(r.summary));
}
{
  const doc = { $metadata: { tokenSetOrder: ['core'] }, core: { red: tok('#ff0000'), blue: tok('#0000ff') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  /* A document holding the same names with one different value. */
  const existing = [{
    id: 'c1', name: 'core', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'core' }],
    variables: [
      { id: 'v1', name: 'red', resolvedType: 'COLOR', valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } } },
      { id: 'v2', name: 'blue', resolvedType: 'COLOR', valuesByMode: { m1: { r: 0, g: 1, b: 0, a: 1 } } },
      { id: 'v3', name: 'mine', resolvedType: 'COLOR', valuesByMode: { m1: { r: 0.5, g: 0.5, b: 0.5, a: 1 } } },
    ],
  }];
  const r = diff(existing, c.program);
  ok('diff: an identical value is not reported as a change', r.summary.valuesUnchanged === 1);
  ok('diff: a different value is reported, with both sides',
     r.changed.length === 1 && /blue/.test(r.changed[0].key) &&
     r.changed[0].from === '#00ff00' && r.changed[0].to === '#0000ff',
     JSON.stringify(r.changed));
  ok('diff: a variable the file does not mention is LEFT ALONE, not deleted',
     r.untouched.length === 1 && /mine/.test(r.untouched[0]) && r.summary.valuesLeftAlone === 1);
  ok('diff: an existing collection is touched, not created',
     r.collections.added.length === 0 && r.collections.touched.indexOf('core') !== -1);
  ok('diff: format() says what would be overwritten',
     /WOULD OVERWRITE/.test(format(r)) && /never deletes/.test(format(r)));
}
{
  /* Nothing to do is a real answer. */
  const doc = { $metadata: { tokenSetOrder: ['core'] }, core: { red: tok('#ff0000') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const same = [{ id: 'c1', name: 'core', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'core' }],
    variables: [{ id: 'v1', name: 'red', resolvedType: 'COLOR', valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } } }] }];
  const r = diff(same, c.program);
  ok('diff: reports a no-op when the document already matches',
     r.summary.noop === true && /nothing would change/.test(format(r)));
}
{
  /* A mode arriving on a collection that already exists is called out on its
     own — it is a bigger commitment than a variable, and it is what the mode
     ceiling gets spent on. */
  const doc = { $metadata: { tokenSetOrder: ['m/light', 'm/dark'] },
    'm/light': { bg: tok('#111111') }, 'm/dark': { bg: tok('#222222') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const existing = [{ id: 'c1', name: 'm', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'light' }],
    variables: [{ id: 'v1', name: 'bg', resolvedType: 'COLOR', valuesByMode: { m1: { r: 0.0667, g: 0.0667, b: 0.0667, a: 1 } } }] }];
  const r = diff(existing, c.program);
  ok('diff: a new mode on an existing collection is named',
     r.modes.added.length === 1 && /dark/.test(r.modes.added[0]), JSON.stringify(r.modes.added));
}

/* ── apply(): the only module that writes ────────────────────────────────── */
{
  const doc = { $metadata: { tokenSetOrder: ['core', 'mode/light', 'mode/dark'] },
    core: { red: tok('#ff0000') },
    'mode/light': { bg: tok('{red}') }, 'mode/dark': { bg: tok('#330000') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const F = mockFigma();
  const rep = apply(c.program, F);

  ok('apply: every op applied, none failed',
     rep.applied === c.program.ops.length && rep.failed === 0, JSON.stringify(rep.errors));
  ok('apply: the first mode is RENAMED, never added',
     F.calls.filter((x) => x.startsWith('renameMode')).length === 2 &&
     F.calls.filter((x) => x.startsWith('addMode')).length === 1,
     F.calls.filter((x) => /Mode/.test(x)).join(','));
  ok('apply: no collection is left holding "Mode 1"',
     F.collections.every((col) => !col.modes.some((m) => m.name === 'Mode 1')));
  ok('apply: reports what it created, for undoing it',
     rep.created.length === 2 && rep.created.every((n) => typeof n === 'string'));

  /* THE ONE THAT MATTERS: the writer and the pure interpreter must agree. If
     they can diverge, everything verified in step 5 was verified about
     something other than what actually gets written. */
  ok('APPLY == MATERIALISE: the writer agrees with the model it was verified against',
     fingerprint(fromRawGraph(F.toRawGraph())) === fingerprint(materialise(c.program)));
  const r = compare(materialise(c.program), fromRawGraph(F.toRawGraph()));
  ok('APPLY == MATERIALISE: nothing missing, changed or extra',
     r.closed && r.extra.length === 0 && r.matched > 0,
     JSON.stringify({ missing: r.missing, changed: r.changed, extra: r.extra }));
}
{
  const doc = { $metadata: { tokenSetOrder: ['a'] }, a: { x: tok('#111111') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const rep = apply(c.program, mockFigma(), { dryRun: true });
  ok('apply: a dry run counts everything and writes nothing',
     rep.dryRun === true && rep.applied === c.program.ops.length &&
     rep.variables === 0 && rep.created.length === 0);
}
{
  /* A program that has gone wrong halfway is not going to come right in its
     second half — it stops, and says exactly what exists now. */
  const doc = { $metadata: { tokenSetOrder: ['a'] }, a: { x: tok('#111111'), y: tok('#222222') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const rep = apply(c.program, mockFigma('variable'), {});
  ok('apply: stops at the first failure by default',
     rep.failed === 1 && rep.applied < c.program.ops.length, JSON.stringify(rep));
  ok('apply: and still reports the collection it had created',
     rep.created.length === 1, JSON.stringify(rep.created));
  const keepGoing = apply(c.program, mockFigma('variable'), { stopOnError: false });
  ok('apply: stopOnError:false collects instead',
     keepGoing.failed > 1, 'failed ' + keepGoing.failed);
}

/* ── preflight(): ask the document before writing to it ──────────────────── */
{
  const doc = { $metadata: { tokenSetOrder: ['core'] }, core: { red: tok('#ff0000') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  (async () => {
    const clean = await preflight(c.program, mockFigma(), {});
    ok('preflight: an empty document is fine', clean.ok === true && clean.existingCollections === 0);

    const dirty = mockFigma();
    dirty.variables.createVariableCollection('already here');
    const p2 = await preflight(c.program, dirty, {});
    ok('preflight: refuses a target that already holds collections',
       p2.ok === false && p2.problems[0].kind === 'not-empty');
    const p3 = await preflight(c.program, dirty, { allowExisting: true });
    ok('preflight: unless the caller says otherwise', p3.ok === true);

    /* The ceiling is found by hitting it, in a collection that is removed
       either way — compile() is only ever told the ceiling by its caller. */
    const wide = { $metadata: { tokenSetOrder: ['w/a', 'w/b', 'w/c'] },
      'w/a': { x: tok('#111111') }, 'w/b': { x: tok('#222222') }, 'w/c': { x: tok('#333333') } };
    const wir = toIR(wide);
    const wc = compile(wir, derive(wir, {}), {});
    const capped = mockFigma('mode');
    const p4 = await preflight(wc.program, capped, {});
    ok('preflight: finds the real mode ceiling by attempting it',
       p4.ok === false && p4.problems.some((x) => x.kind === 'mode-ceiling'),
       JSON.stringify(p4.problems));
    ok('preflight: and removes the collection it probed with',
       capped.collections.every((c2) => c2.name !== '__closure_preflight__'));

    console.log('');
    console.log(pass + '/' + (pass + fail) + ' passed');
    process.exit(fail ? 1 : 0);
  })();
}
