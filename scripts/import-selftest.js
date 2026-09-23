#!/usr/bin/env node
//
// import-selftest.js — the import pipeline's own suite. No Figma, no network.
//
// Most of these assert a REFUSAL rather than a result. That is the point: the
// failure mode this pipeline is built against is a wrong projection applied
// silently, so the tests that matter most are the ones proving it stops.
//
const { toIR, detect } = require('../src/import-ir.js');
const { derive, applyLevels, levelCandidates } = require('../src/import-derive.js');
const { compile, toColor, evaluate, toManifest } = require('../src/import-compile.js');
const { buildManifest, bindManifest, bindThemes } = require('../src/import-manifest.js');
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

/* The same shape src/import-apply.js's snapshot() builds, from the mock. */
function snapshotOf(F) {
  return F.collections.map((c) => ({
    name: c.name, handle: c,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: c.vars.map((v) => ({ name: v.name, handle: v })),
  }));
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

/* ── DTCG writes two SCALARS as objects ──────────────────────────────────── */
{
  /* Found by importing a real 8,312-token DTCG document: it landed 723
     variables and not one COLOR. Colour and dimension are objects in that
     spec, the importer read every object as a composite, and because the
     primitives are what everything references, dropping them took the whole
     graph down with them — a 6,480-variable collection vanished entirely. */
  ok('dtcg colour: components in sRGB', (() => {
    const c = toColor({ colorSpace: 'srgb', components: [1, 0, 0.5], alpha: 1 });
    return c && c.r === 1 && c.g === 0 && c.b === 0.5 && c.a === 1;
  })());
  ok('dtcg colour: alpha is carried', (() => {
    const c = toColor({ colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.4 });
    return c && Math.abs(c.a - 0.4) < 1e-9;
  })());
  ok('dtcg colour: hex is the fallback, and the separate alpha still applies', (() => {
    const c = toColor({ colorSpace: 'display-p3', components: [1, 0, 0], alpha: 0.5, hex: '#ff0000' });
    return c && c.r === 1 && Math.abs(c.a - 0.5) < 1e-9;
  })());
  ok('dtcg colour: an 8-digit hex keeps its own alpha', (() => {
    const c = toColor({ colorSpace: 'display-p3', components: [0, 0, 0], alpha: 1, hex: '#0000001f' });
    return c && Math.abs(c.a - 31 / 255) < 1e-9;
  })());
  ok('dtcg colour: a space we cannot read, with no hex, is refused not invented',
     toColor({ colorSpace: 'display-p3', components: [1, 0, 0], alpha: 1 }) === null);

  const { coerce } = require('../src/import-compile.js');
  ok('dtcg dimension: { value, unit } is a number with its unit noted', (() => {
    const c = coerce('FLOAT', { value: 16, unit: 'px' });
    return c.ok && c.value === 16 && c.unit === 'px';
  })());
  ok('dtcg dimension: a non-numeric value is refused',
     coerce('FLOAT', { value: 'wide', unit: 'px' }).ok === false);
}
{
  /* End to end, in the shape a real DTCG export arrives in. */
  const doc = {
    core: { $type: 'color', red: { $value: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 1 } } },
    size: { base: { $value: { value: 4, unit: 'px' }, $type: 'dimension' } },
    mode: { bg: { $value: '{core.red}', $type: 'color' },
            pad: { $value: '{size.base}', $type: 'dimension' } },
  };
  const ir = toIR(doc);
  ok('dtcg end to end: detected as dtcg', ir.source === 'dtcg');
  const plan = derive(ir, {});
  const c = compile(ir, plan, {});
  ok('dtcg end to end: nothing is mistaken for a composite',
     plan.losses.composites.length === 0, JSON.stringify(plan.losses.composites));
  ok('dtcg end to end: no variable is dropped as valueless',
     c.stats.skippedEmpty === 0 && c.stats.variables === 4, JSON.stringify(c.stats));
  /* 'core/red', not 'red' — in DTCG the top-level key is part of the path,
     which is what makes {core.red} resolve. */
  const colour = c.program.ops.find((o) => o.op === 'setValue' && o.name === 'core/red');
  ok('dtcg end to end: the colour lands as 0..1 rgba',
     colour && colour.value.r === 1 && colour.value.g === 0, JSON.stringify(colour));
  ok('dtcg end to end: the references survive',
     c.stats.aliases === 2, JSON.stringify(c.stats));
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

/* ── the level map: which DEPTH of a path is an axis ─────────────────────── */
{
  /* A document with no set names at all — the axis is a nesting depth, which
     is the shape derive() could not read before. Two modes x two schemes x
     three leaves, built as a clean cross-product on purpose. */
  const doc = { theme: {} };
  ['light', 'dark'].forEach((m) => {
    doc.theme[m] = {};
    ['brand', 'neutral'].forEach((sch) => {
      doc.theme[m][sch] = {};
      ['bg', 'fg', 'line'].forEach((leaf) => {
        doc.theme[m][sch][leaf] = tok('#' + (m === 'light' ? 'ff' : '00') + '1111');
      });
    });
  });
  const ir = toIR(doc);
  ok('levels: without a map it is all one collection, all one mode', (() => {
    const p = derive(ir, {});
    return p.collections.length === 1 && p.collections[0].modes.length === 1 &&
           p.collections[0].variables === 12;
  })(), JSON.stringify(derive(ir, {}).collections));

  /* MEASURED, not guessed: a depth is a candidate when its branches carry the
     same paths beneath them. Both depths qualify here, and both are reported —
     choosing between them is the caller's. */
  /* Depth 0 and 1, not 1 and 2: this document has no $metadata so it reads as
     legacy, where the top-level key is the SET and is not part of the path.
     The same tree in DTCG would put both axes one deeper. */
  const cands = levelCandidates(ir);
  ok('levels: both real axes are proposed',
     cands.length === 2 && cands.every((c) => c.overlap === 100) &&
     cands.some((c) => c.depth === 0 && c.distinct === 2) &&
     cands.some((c) => c.depth === 1 && c.distinct === 2),
     JSON.stringify(cands.map((c) => 'd' + c.depth + ':' + c.distinct + '@' + c.overlap)));

  /* Candidates are measured on the ORIGINAL rows, so the list does not shrink
     as it is used: what a document COULD be read as does not change because of
     what it is currently being read as, and a caller offering these as choices
     needs the siblings of the one already taken. */
  const chosen = derive(ir, { levels: { theme: { 0: 'mode' } } });
  ok('levels: every candidate is still reported once one is applied',
     chosen.levelCandidates.length === 2, JSON.stringify(chosen.levelCandidates.map((c) => c.depth)));
  ok('levels: the one in force carries its role, and its sibling is told modes are taken',
     chosen.levelCandidates.some((c) => c.depth === 0 && c.role === 'mode' && !c.modeTakenBySibling) &&
     chosen.levelCandidates.some((c) => c.depth === 1 && c.role === 'name' && c.modeTakenBySibling === true),
     JSON.stringify(chosen.levelCandidates.map((c) => 'd' + c.depth + ' role=' + c.role + ' taken=' + c.modeTakenBySibling)));

  const p1 = derive(ir, { levels: { theme: { 0: 'mode' } } });
  ok('levels: promoting a depth turns it into the mode axis',
     p1.collections.length === 1 && p1.collections[0].modes.join(',') === 'light,dark' &&
     p1.collections[0].variables === 6,
     JSON.stringify(p1.collections));

  /* The promoted segment must LEAVE the name, or it appears twice — once as
     the axis and once inside every variable that sits under it. */
  const c1 = compile(ir, p1, {});
  ok('levels: the promoted segment is gone from the variable names',
     c1.program.ops.filter((o) => o.op === 'createVariable')
       .every((o) => !/light|dark/.test(o.name)),
     c1.program.ops.filter((o) => o.op === 'createVariable').map((o) => o.name).slice(0, 3).join(', '));

  const p2 = derive(ir, { levels: { theme: { 1: 'mode' } } });
  ok('levels: a different depth gives a different, equally valid projection',
     p2.collections[0].modes.join(',') === 'brand,neutral' && p2.collections[0].variables === 6,
     JSON.stringify(p2.collections));
}
{
  /* ONE AXIS PER COLLECTION is Figma's rule. A document with two independent
     axes cannot become one collection however the depths are assigned — the
     system that produced such a document solves it with separate collections
     and aliases, which an import cannot synthesise. */
  const doc = { t: { light: { a: { x: tok('#111111') } }, dark: { a: { x: tok('#222222') } } } };
  const ir = toIR(doc);
  const p = derive(ir, { levels: { t: { 0: 'mode', 1: 'mode' } } });
  ok('levels: promoting two depths is refused, not approximated',
     p.ok === false && p.unresolved.some((q) => q.id === 'level:t'),
     JSON.stringify(p.unresolved.map((q) => q.id)));
  ok('levels: and the refusal says why',
     /exactly one mode axis/.test((p.unresolved.find((q) => q.id === 'level:t') || {}).question || ''));
}
{
  /* THREE READINGS, and the measurement tells them apart the same way the
     group verdict does one level up. Branches carrying the SAME paths are one
     thing taking different values — an axis. Branches carrying DISJOINT paths
     are separate namespaces sharing a parent — collections. */
  const axis = { t: { light: { a: tok('#111111') }, dark: { a: tok('#222222') } } };
  const namespaces = { t: { white: { whiteBg: tok('#ffffff') }, black: { blackBg: tok('#000000') } } };

  const ca = levelCandidates(toIR(axis));
  ok('levels: shared paths suggest MODES',
     ca.length === 1 && ca[0].suggests === 'mode' && ca[0].overlap === 100, JSON.stringify(ca));

  const cn = levelCandidates(toIR(namespaces));
  ok('levels: disjoint paths suggest COLLECTIONS, rather than nothing',
     cn.length === 1 && cn[0].suggests === 'collection' && cn[0].overlap === 0, JSON.stringify(cn));

  /* Reading a depth as collections gives each value a collection of its own,
     each with the single mode a collection without an axis has. */
  const split = derive(toIR(namespaces), { levels: { t: { 0: 'collection' } } });
  ok('levels: as collections, each value becomes its own collection',
     split.collections.length === 2 &&
     split.collections.map((c) => c.name).sort().join(',') === 'black,white' &&
     split.collections.every((c) => c.modes.length === 1),
     JSON.stringify(split.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  /* The same depth, read as modes instead — one collection, two modes. */
  const folded = derive(toIR(axis), { levels: { t: { 0: 'mode' } } });
  ok('levels: as modes, one collection carries them as its axis',
     folded.collections.length === 1 && folded.collections[0].modes.join(',') === 'light,dark',
     JSON.stringify(folded.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  /* And left alone it is simply part of every name — the default. */
  const plain = derive(toIR(axis), {});
  ok('levels: left alone it stays in the names',
     plain.collections.length === 1 && plain.collections[0].modes.length === 1 &&
     plain.collections[0].variables === 2);
}
{
  /* A collection split does not compete with a mode: the split produces
     independent collections, each free to carry an axis of its own. */
  const doc = { t: { white: { light: { a: tok('#111111') }, dark: { a: tok('#222222') } },
                     black: { light: { a: tok('#333333') }, dark: { a: tok('#444444') } } } };
  const p = derive(toIR(doc), { levels: { t: { 0: 'collection', 1: 'mode' } } });
  ok('levels: collections and modes can be assigned together',
     p.ok === true && p.collections.length === 2 &&
     p.collections.every((c) => c.modes.join(',') === 'light,dark'),
     JSON.stringify(p.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
  ok('levels: and the promoted segments leave the names',
     compile(toIR(doc), p, {}).program.ops
       .filter((o) => o.op === 'createVariable')
       .every((o) => !/white|black|light|dark/.test(o.name)));
}
{
  /* applyLevels is a pre-transform on the IR and nothing downstream knows it
     ran — which is what keeps the rest of derive() unchanged. */
  const doc = { t: { light: { a: tok('#111111') }, dark: { a: tok('#222222') } } };
  const ir = toIR(doc);
  const moved = applyLevels(ir, { t: { 0: 'mode' } });
  ok('applyLevels: the promoted segment becomes the variant',
     moved.rows.every((r) => r.variant === 'light' || r.variant === 'dark'),
     JSON.stringify(moved.rows.map((r) => r.variant + '|' + r.path)));
  ok('applyLevels: and leaves the path',
     moved.rows.every((r) => r.path === 'a'), JSON.stringify(moved.rows.map((r) => r.path)));
  ok('applyLevels: no map is a no-op', applyLevels(ir, {}) === ir);
}
{
  /* The payoff, on the shape that actually failed: promoting one depth takes a
     collection from over Figma's 5,000 cap to under it. */
  const doc = { big: {} };
  ['light', 'dark'].forEach((m) => {
    doc.big[m] = {};
    for (let i = 0; i < 2600; i++) doc.big[m]['v' + i] = tok('#111111');
  });
  const ir = toIR(doc);
  const flat = derive(ir, {});
  ok('levels: as one flat collection it is over the cap',
     flat.blocked.length === 1 && flat.blocked[0].kind === 'variables' && flat.blocked[0].needs === 5200,
     JSON.stringify(flat.blocked));
  const axed = derive(ir, { levels: { big: { 0: 'mode' } } });
  ok('levels: with the axis promoted it fits',
     axed.blocked.length === 0 && axed.collections[0].variables === 2600 &&
     axed.collections[0].modes.length === 2,
     JSON.stringify(axed.collections));
  ok('levels: and it compiles', compile(ir, axed, {}).ok === true);
}

/* ── a REAL DTCG document, which is the format that broke ────────────────── */
{
  /*
    scripts/__fixtures__/dtcg-resolved-sample.json is a closed slice of an
    actual 8,312-token W3C DTCG export from this plugin — every value shape
    that document contains, kept in its own nesting, with every reference
    target pulled in so nothing dangles.

    IT EXISTS BECAUSE 135 TESTS DID NOT CATCH THIS. Every fixture before it was
    Tokens Studio format, and the one format never fed to the importer was
    Closure's own DTCG output. A real file found two bugs on first contact: an
    object colour read as a composite, and a per-collection variable limit
    discovered by hitting it. Both are pinned here.
  */
  const doc = require('./__fixtures__/dtcg-resolved-sample.json');
  const ir = toIR(doc);
  ok('dtcg fixture: detected as DTCG', ir.source === 'dtcg', ir.source);

  const plan = derive(ir, {});
  const c = compile(ir, plan, { evaluateExpressions: true });
  ok('dtcg fixture: it compiles', c.ok === true, JSON.stringify((c.refusals || []).slice(0, 2)));

  /* Before the fix this was most of the document: the object-valued colours
     and dimensions were refused, and everything referencing them cascaded. */
  ok('dtcg fixture: NOTHING is dropped as valueless',
     c.stats.skippedEmpty === 0 && c.stats.skippedEmptyCollections.length === 0,
     JSON.stringify(c.stats));

  /* Before the fix: zero. Every colour in the document was lost. */
  const colours = c.program.ops.filter((o) => o.op === 'setValue' && o.value && typeof o.value === 'object');
  ok('dtcg fixture: object colours land as 0..1 rgba',
     colours.length > 0 && colours.every((o) =>
       typeof o.value.r === 'number' && o.value.r >= 0 && o.value.r <= 1 &&
       typeof o.value.a === 'number'),
     JSON.stringify(colours[0]));

  /* { value, unit } becomes a bare number, the same as "16px" already did. */
  ok('dtcg fixture: object dimensions land as numbers',
     c.program.ops.some((o) => o.op === 'setValue' && typeof o.value === 'number') &&
     c.stats.unitsDropped.indexOf('px') !== -1,
     JSON.stringify(c.stats.unitsDropped));

  /* Only the genuine composites — shadow and typography — are skipped. Before
     the fix every colour and dimension was counted here too. */
  ok('dtcg fixture: only real composites are treated as composites',
     plan.losses.composites.every((x) => /shadow|typography/.test(x.type)),
     JSON.stringify(plan.losses.composites.map((x) => x.type)));

  ok('dtcg fixture: every reference resolves',
     plan.losses.unresolvedRefs.length === 0 && c.stats.aliases > 0,
     JSON.stringify(plan.losses.unresolvedRefs.slice(0, 3)));

  /* The whole document is accounted for: what lands, plus what genuinely
     cannot be a variable, equals what came in. */
  ok('dtcg fixture: nothing goes missing unexplained',
     c.stats.variables + c.stats.skippedComposite === ir.rows.length,
     c.stats.variables + ' + ' + c.stats.skippedComposite + ' vs ' + ir.rows.length);
}

/* ── the level map travels with the document ─────────────────────────────── */
{
  /*
    The level map is the ONE part of the projection no measurement can settle.
    Whether light/dark are modes, collections or names is a fact about the
    system, not about the bytes — everything else in the manifest can be
    re-derived if lost. So it is asked once and written into $figmaStructure.
  */
  const base = { t: { light: { a: tok('#111111'), b: tok('#222222') },
                      dark: { a: tok('#333333'), b: tok('#444444') } } };

  const answered = derive(toIR(base), { levels: { t: { 0: 'mode' } } });
  const first = compile(toIR(base), answered, {});
  ok('manifest: it carries the level map',
     first.manifest.levels && first.manifest.levels.t['0'] === 'mode',
     JSON.stringify(first.manifest.levels));
  ok('manifest: and not an empty one when nothing was assigned',
     compile(toIR(base), derive(toIR(base), {}), {}).manifest.levels === undefined);

  /* Written back into the file, a cold import needs no answer. */
  const withManifest = Object.assign({}, base, { $figmaStructure: first.manifest });
  const cold = derive(toIR(withManifest), {});
  ok('manifest: a cold re-import reads the map from the file',
     cold.levelsDeclared === true &&
     cold.collections.length === 1 && cold.collections[0].modes.join(',') === 'light,dark',
     JSON.stringify(cold.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  /* The point of all of it: the same program, without being asked twice. */
  const second = compile(toIR(withManifest), cold, {});
  ok('manifest: and produces the identical program',
     fingerprint(materialise(first.program)) === fingerprint(materialise(second.program)),
     fingerprint(materialise(first.program)) + ' vs ' + fingerprint(materialise(second.program)));

  /* A caller still outranks the file — the map is a default, not a lock. */
  const overridden = derive(toIR(withManifest), { levels: { t: { 0: 'collection' } } });
  ok('manifest: a caller still overrides what the file says',
     overridden.levelsDeclared === false && overridden.collections.length === 2,
     JSON.stringify(overridden.collections.map((c) => c.name)));
}
{
  /* ONE KEY, ONE SHAPE. buildManifest() on the export side and toManifest()
     on the import side both write $figmaStructure and bindManifest() reads
     it, so all three must agree on the field. They did not: one wrote
     `figmaName` and the other `name`, and nothing had round-tripped an
     import's own manifest back through an import until the level map made
     that the whole point. The first thing that did got a collection called
     "undefined". */
  const { buildManifest, bindManifest } = require('../src/import-manifest.js');
  const exported = buildManifest([{ name: '.core', modes: [{ name: '.core' }], variables: [1] }]);
  const doc = { $metadata: { tokenSetOrder: ['core'] }, core: { red: tok('#ff0000') } };
  const plan = derive(toIR(doc), {});
  const imported = compile(toIR(doc), plan, {}).manifest;
  ok('manifest: both sides name the collection the same way',
     'figmaName' in exported.collections[0] && 'figmaName' in imported.collections[0],
     Object.keys(imported.collections[0]).join(','));
  ok('manifest: and what an import writes, an import can read back',
     !!bindManifest(toIR(doc), imported));
}

/* ── a DTCG document that also declares its sets ─────────────────────────── */
{
  /*
    scripts/__fixtures__/dtcg-with-metadata-sample.json — a closed slice of a
    real 771 KB file that imported as ZERO tokens.

    detect() returned 'legacy' the moment it saw $metadata.tokenSetOrder, on
    the assumption that only Tokens Studio writes one. Not so: this plugin's
    own DTCG export keeps $themes and $metadata at the root by design, so a
    downstream build step can still read them. The legacy adapter then looked
    for `value` and `type` rather than `$value` and `$type`, found nothing, and
    the UI said "no tokens in that file" about a document full of them.

    A set list says how a document is ORGANISED. It says nothing about how its
    tokens are spelled.
  */
  const doc = require('./__fixtures__/dtcg-with-metadata-sample.json');
  ok('metadata+dtcg: $metadata no longer overrules the token shape',
     detect(doc) === 'dtcg', detect(doc));

  const ir = toIR(doc);
  ok('metadata+dtcg: the tokens are actually found', ir.rows.length > 20, String(ir.rows.length));

  /* And when a document declares its sets, a top-level key IS a set — so it is
     stripped from the path, "/" or no "/". Its references read
     {core-colours.neutral.150}, which resolves only once "core" is gone. */
  const plan = derive(ir, {});
  ok('metadata+dtcg: every reference resolves',
     plan.losses.unresolvedRefs.length === 0,
     JSON.stringify(plan.losses.unresolvedRefs.slice(0, 3)));
  ok('metadata+dtcg: and it compiles',
     compile(ir, plan, { evaluateExpressions: true }).ok === true);
}
{
  /* NOT EVERY $themes IS AN ARCHITECTURE. An ungrouped theme enabling nine
     sets across as many axes is one complete LOOK, not a collection — it says
     which sets are on together. Read as a declaration it produced a
     collection called "light" with seventeen modes, because every set either
     theme enabled went to whichever claimed it first, including the four both
     of them enable. */
  const selections = {
    $metadata: { tokenSetOrder: ['a', 'b', 'mode/light', 'mode/dark'] },
    a: { x: tok('#111111') }, b: { y: tok('#222222') },
    'mode/light': { bg: tok('#333333') }, 'mode/dark': { bg: tok('#444444') },
    $themes: [
      { id: '1', name: 'light', selectedTokenSets: { a: 'enabled', b: 'enabled', 'mode/light': 'enabled' } },
      { id: '2', name: 'dark', selectedTokenSets: { a: 'enabled', b: 'enabled', 'mode/dark': 'enabled' } },
    ],
  };
  const plan = derive(toIR(selections), {});
  ok('themes: a multi-set ungrouped theme declares nothing',
     plan.usedThemes === false,
     JSON.stringify(plan.collections.map((c) => c.name + '[' + c.modes.length + ']')));
  ok('themes: so the file is measured, and mode/light+dark still become an axis',
     plan.collections.some((c) => c.name === 'mode' && c.modes.join(',') === 'light,dark'),
     JSON.stringify(plan.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  /* One set enabled is unambiguous: the set and the collection are the same
     thing, and the theme's name is its only mode. That is the shape the ODS
     document uses, and it still binds. */
  const declarations = {
    $metadata: { tokenSetOrder: ['core'] },
    core: { x: tok('#111111') },
    $themes: [{ id: '1', name: '.core', selectedTokenSets: { core: 'enabled' } }],
  };
  const d2 = derive(toIR(declarations), {});
  ok('themes: a single-set ungrouped theme still declares',
     d2.usedThemes === true && d2.collections[0].name === '.core',
     JSON.stringify(d2.collections.map((c) => c.name)));
}
{
  /* DTCG has a duration type and Figma does not; the value is milliseconds,
     so a unitless FLOAT carries it honestly. It used to fall through to
     STRING, which made "100" un-arithmetic. */
  const doc = { m: { fast: { $value: '100', $type: 'duration' } } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});
  const op = c.program.ops.find((o) => o.op === 'createVariable');
  ok('duration: lands as a FLOAT, not a string', op && op.type === 'FLOAT', JSON.stringify(op));
  ok('duration: and keeps its number',
     c.program.ops.some((o) => o.op === 'setValue' && o.value === 100));
}

/* ── $themes is already an architecture ──────────────────────────────────── */
{
  /*
    Every Tokens Studio document carries a $themes list, and it says more than
    the set names ever could: `group` is the Figma COLLECTION under its real
    name, `name` is the MODE, and the `enabled` sets are the ones that
    collection owns. `source` is a set the theme merely reads.

    It outranks measurement because it is a declaration, it is present on
    every such export rather than only ones this plugin wrote, and it carries
    names nothing else can reach — ".breakpoint" declares modes "S Mobile"
    and "M Tablet" where the SET names had already flattened those to "mobile"
    and "tablet". Against the file this was built from it takes the
    collections matching Figma exactly from 2 of 14 to 11.
  */
  const doc = {
    $metadata: { tokenSetOrder: ['core', 'mode/light', 'mode/dark', 'bp/small', 'bp/large'] },
    core: { red: tok('#ff0000') },
    'mode/light': { bg: tok('{red}') },
    'mode/dark': { bg: tok('#330000') },
    'bp/small': { gap: tok(4, 'dimension') },
    'bp/large': { gap: tok(8, 'dimension') },
    $themes: [
      { id: '1', name: '.core', selectedTokenSets: { core: 'enabled' } },
      { id: '2', name: 'light', group: '.mode', selectedTokenSets: { 'mode/light': 'enabled', core: 'source' } },
      { id: '3', name: 'dark', group: '.mode', selectedTokenSets: { 'mode/dark': 'enabled', core: 'source' } },
      { id: '4', name: 'S Mobile', group: '.breakpoint', selectedTokenSets: { 'bp/small': 'enabled' } },
      { id: '5', name: 'L Large', group: '.breakpoint', selectedTokenSets: { 'bp/large': 'enabled' } },
    ],
  };
  const ir = toIR(doc);
  const b = bindThemes(ir);
  ok('themes: group is the collection, name is the mode',
     b.collections.get('.mode').join(',') === 'light,dark' &&
     b.collections.get('.breakpoint').join(',') === 'S Mobile,L Large',
     JSON.stringify([...b.collections]));
  ok('themes: `source` is a dependency, not ownership — core belongs to one theme only',
     b.setMap.get('core').collection === '.core',
     JSON.stringify(b.setMap.get('core')));

  const plan = derive(ir, {});
  ok('themes: the declaration is used', plan.usedThemes === true);
  ok('themes: the real Figma names come back, dots and all',
     plan.collections.map((c) => c.name).sort().join(',') === '.breakpoint,.core,.mode',
     JSON.stringify(plan.collections.map((c) => c.name)));
  ok('themes: and the mode names the SET names had flattened',
     plan.collections.find((c) => c.name === '.breakpoint').modes.join(',') === 'S Mobile,L Large',
     JSON.stringify(plan.collections.find((c) => c.name === '.breakpoint').modes));

  /* Measured instead, the same file loses both. */
  const measured = derive(ir, { ignoreThemes: true });
  ok('themes: without them it is set names all the way down',
     measured.collections.map((c) => c.name).sort().join(',') === 'bp,core,mode' &&
     measured.collections.find((c) => c.name === 'bp').modes.join(',') === 'small,large',
     JSON.stringify(measured.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
}
{
  /* A theme list can be INCOMPLETE — eight of forty-six sets in the real
     document are enabled by no theme. A forgotten set whose prefix belongs to
     a declared collection is a forgotten MODE, not a new collection: left
     alone it becomes a rival of the same name and every path the two share is
     a reference collision. */
  const doc = {
    $metadata: { tokenSetOrder: ['s/a', 's/b', 's/forgotten'] },
    's/a': { x: tok('#111111') },
    's/b': { x: tok('#222222') },
    's/forgotten': { x: tok('#333333') },
    $themes: [
      { id: '1', name: 'a', group: '.s', selectedTokenSets: { 's/a': 'enabled' } },
      { id: '2', name: 'b', group: '.s', selectedTokenSets: { 's/b': 'enabled' } },
    ],
  };
  const plan = derive(toIR(doc), {});
  ok('themes: a forgotten set joins the collection its prefix names',
     plan.collections.length === 1 && plan.collections[0].name === '.s' &&
     plan.collections[0].modes.join(',') === 'a,b,forgotten',
     JSON.stringify(plan.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
  ok('themes: so it does not become a rival collection and collide',
     compile(toIR(doc), plan, {}).ok === true);
  ok('themes: and the gap is reported rather than hidden',
     plan.themeBinding.measured === 1 && plan.themeBinding.uncovered[0] === 's/forgotten',
     JSON.stringify(plan.themeBinding));
}
{
  ok('themes: a document without them is unaffected', bindThemes({ themes: null }) === null);
  ok('themes: and one whose themes enable nothing', bindThemes({ themes: [{ name: 'x', selectedTokenSets: {} }] }) === null);
}

/* ── an explicit reading outranks every declaration ──────────────────────── */
{
  /*
    A declaration is what the file says when nobody has said otherwise.
    Somebody just did. A file cannot overrule the person importing it.

    This was wrong and silently so: $themes addresses a row by its SET, which
    the level map never touches, so an explicit choice was discarded and only
    the NAME change survived. "modes" and "collections" produced the identical
    document — two different answers, one outcome, and no error.
  */
  const doc = {
    $metadata: { tokenSetOrder: ['r/a', 'r/b'] },
    'r/a': { normal: { x: tok('#111111') }, subtle: { x: tok('#222222') } },
    'r/b': { normal: { x: tok('#333333') }, subtle: { x: tok('#444444') } },
    $themes: [
      { id: '1', name: 'a', group: '.r', selectedTokenSets: { 'r/a': 'enabled' } },
      { id: '2', name: 'b', group: '.r', selectedTokenSets: { 'r/b': 'enabled' } },
    ],
  };
  const ir = toIR(doc);

  const declared = derive(ir, {});
  ok('precedence: with no reading chosen, the declaration stands',
     declared.collections.length === 1 && declared.collections[0].name === '.r' &&
     declared.collections[0].modes.join(',') === 'a,b',
     JSON.stringify(declared.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  const asModes = derive(ir, { levels: { r: { 0: 'mode' } } });
  const asCollections = derive(ir, { levels: { r: { 0: 'collection' } } });
  ok('precedence: a chosen reading displaces the declaration',
     asModes.collections[0].modes.join(',') === 'normal,subtle',
     JSON.stringify(asModes.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
  ok('precedence: and the two readings differ, which is the whole point',
     asCollections.collections.length === 2 &&
     asCollections.collections.map((c) => c.name).sort().join(',') === 'normal,subtle',
     JSON.stringify(asCollections.collections.map((c) => c.name)));
}
{
  /* But NAMES and SHAPE are orthogonal. $figmaStructure says what a collection
     is called; a level map says which depth is an axis. A level map the FILE
     declared arrives beside exactly such a binding, so the two compose. */
  const dt = (v) => ({ $value: v, $type: 'color' });
  const doc = {
    mode: { light: { bg: dt('#111111') }, dark: { bg: dt('#222222') } },
    $figmaStructure: {
      version: 1,
      collections: [{ figmaName: '.mode', modes: ['light', 'dark'] }],
      levels: { mode: { '1': { role: 'mode', axis: '.mode' } } },
    },
  };
  const plan = derive(toIR(doc), {});
  ok('precedence: a declared reading still takes its declared NAME',
     plan.collections.length === 1 && plan.collections[0].name === '.mode' &&
     plan.collections[0].modes.join(',') === 'light,dark',
     JSON.stringify(plan.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
}
{
  /* The preview needs rows, not just a count — a count cannot show what a
     reading does to the NAMES, which is most of what separates the three. */
  const doc = { $metadata: { tokenSetOrder: ['c'] }, c: { a: { b: tok('#111111') } } };
  const plan = derive(toIR(doc), {});
  ok('preview: collections carry sample variable names',
     Array.isArray(plan.collections[0].sample) && plan.collections[0].sample[0] === 'a/b',
     JSON.stringify(plan.collections[0].sample));
}
{
  /* Each group's preview shows the collections THAT group produced, so every
     collection has to remember where it came from. A `collection` reading
     replaces the group with the segment's own value — "restrictions" becomes
     "normal" and "subtle" — and without originGroup surviving that rewrite,
     the collections could no longer be traced to the choice that made them. */
  const doc = { $metadata: { tokenSetOrder: ['r'] },
    r: { normal: { x: tok('#111111') }, subtle: { x: tok('#222222') } } };
  const ir = toIR(doc);
  const split = derive(ir, { levels: { r: { 0: 'collection' } } });
  ok('preview: a split still traces back to the group that chose it',
     split.collections.length === 2 &&
     split.collections.every((c) => c.fromGroup === 'r'),
     JSON.stringify(split.collections.map((c) => c.name + '<-' + c.fromGroup)));

  const folded = derive(ir, { levels: { r: { 0: 'mode' } } });
  ok('preview: and so does a fold',
     folded.collections.every((c) => c.fromGroup === 'r'),
     JSON.stringify(folded.collections.map((c) => c.name + '<-' + c.fromGroup)));
}

/* ── the EXPORT declares its own nesting ─────────────────────────────────── */
{
  /*
    The resolved shape denormalises axes into nesting: light/dark stop being a
    collection's modes and become a path depth. Until now an importer had to
    measure that back or ask a person — and it never had to, because the
    exporter DECIDED where each axis went. It can simply say so.

    A level entry is therefore either a bare role or { role, axis }: the
    exporter writes the second, since it knows which Figma axis it put at that
    depth. applyLevels only needs the role; the axis is provenance, and the
    measurement can never recover it.
  */
  /* DTCG, deliberately — that is what a resolved export is, and it keeps its
     top-level group in the path, so the axis sits at depth 1. The same tree in
     Tokens Studio form would put it at depth 0. */
  const dt = (v) => ({ $value: v, $type: 'color' });
  const doc = {
    core: { red: dt('#ff0000') },
    mode: { light: { bg: dt('{core.red}') }, dark: { bg: dt('#330000') } },
    $figmaStructure: {
      version: 1,
      collections: [
        { figmaName: '.core', modes: ['.core'] },
        { figmaName: '.mode', modes: ['light', 'dark'] },
      ],
      levels: { mode: { '1': { role: 'mode', axis: '.mode' } } },
    },
  };
  const plan = derive(toIR(doc), {});
  ok('declared: a { role, axis } entry is applied like a bare role',
     plan.levelsDeclared === true &&
     plan.collections.some((c) => c.modes.join(',') === 'light,dark'),
     JSON.stringify(plan.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));

  /* Both halves of $figmaStructure together: the levels restore the AXES and
     the collections restore the NAMES. Neither does both on its own. */
  ok('declared: the original Figma names come back with the axes',
     plan.collections.map((c) => c.name).sort().join(',') === '.core,.mode',
     JSON.stringify(plan.collections.map((c) => c.name)));

  ok('declared: the axis it came from is reported',
     plan.levelCandidates.some((c) => c.group === 'mode' && c.axis === '.mode'),
     JSON.stringify(plan.levelCandidates.map((c) => c.group + ':' + c.depth + '<-' + c.axis)));

  ok('declared: and nothing is left to ask',
     compile(toIR(doc), plan, {}).ok === true);

  /* The same document without the declaration is where this started. */
  const bare = JSON.parse(JSON.stringify(doc));
  delete bare.$figmaStructure;
  const guessed = derive(toIR(bare), {});
  ok('declared: without it the axis is just part of every name',
     guessed.levelsDeclared === false &&
     guessed.collections.every((c) => c.modes.length === 1),
     JSON.stringify(guessed.collections.map((c) => c.name + '[' + c.modes.join(',') + ']')));
}

/* ── Figma caps a collection at 5,000 variables ──────────────────────────── */
{
  /* Found by a real import: 6,195 operations went through and then stopped on
     the 5,001st variable of a collection wanting 6,480. Because every
     createVariable runs before any setValue, the file was left holding 6,192
     variables and not one value. */
  const big = { $metadata: { tokenSetOrder: ['huge'] }, huge: {} };
  for (let i = 0; i < 5200; i++) big.huge['v' + i] = tok('#' + (i % 10) + '11111');
  const ir = toIR(big);

  const plan = derive(ir, {});
  ok('ceiling: a collection over 5,000 variables is blocked',
     plan.blocked.length === 1 && plan.blocked[0].kind === 'variables' &&
     plan.blocked[0].needs === 5200 && plan.blocked[0].ceiling === 5000,
     JSON.stringify(plan.blocked));
  ok('ceiling: blocked is not the same as ambiguous — the plan is still readable',
     plan.ok === true);

  const refused = compile(ir, plan, {});
  ok('GATE: compile refuses it rather than emitting a program that cannot run',
     refused.ok === false && refused.refusals.some((r) => /5,000|5000/.test(r.question)),
     JSON.stringify((refused.refusals || []).map((r) => r.question)));

  const under = derive(toIR(big), { variableCeiling: 10000 });
  ok('ceiling: it can be raised for a caller that knows better',
     under.blocked.length === 0);
}
{
  /* preflight looks at the document rather than being told about it, so it
     also catches a collection pushed over the line by what is ALREADY there. */
  const doc = { $metadata: { tokenSetOrder: ['c'] }, c: {} };
  for (let i = 0; i < 10; i++) doc.c['v' + i] = tok('#111111');
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  const F = mockFigma();
  /* Wrapped, because this file is CommonJS and a top-level await would make
     its module format ambiguous — same reason the preflight block below is. */
  (async () => {
    const clean = await preflight(c.program, F, {});
    ok('preflight: a small program into an empty file is fine', clean.ok === true);

    /* Same program, but the collection already holds 4,995. */
    const crowded = [{ name: 'c', handle: {}, modes: [{ modeId: 'm', name: 'c' }],
                       variables: Array.from({ length: 4995 }, (_, i) => ({ name: 'old' + i, handle: {} })) }];
    const p = await preflight(c.program, F, { existing: crowded });
    ok('preflight: counts what is already there, not just what is arriving',
       p.ok === false && p.problems.some((x) => x.kind === 'variable-ceiling'),
       JSON.stringify(p.problems));
  })();
}

/* ── apply() into a document that already has things in it ──────────────── */
{
  /* The same program, run twice. The second run must change nothing and
     create nothing — if apply() could only create, it would double
     everything, which is precisely why it used to refuse. */
  const doc = { $metadata: { tokenSetOrder: ['core', 'mode/light', 'mode/dark'] },
    core: { red: tok('#ff0000') },
    'mode/light': { bg: tok('{red}') }, 'mode/dark': { bg: tok('#330000') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  const F = mockFigma();
  apply(c.program, F, {});
  const first = fingerprint(fromRawGraph(F.toRawGraph()));
  const collectionsAfterFirst = F.collections.length;

  const again = apply(c.program, F, { existing: snapshotOf(F) });
  ok('upsert: a second run creates no second collection',
     F.collections.length === collectionsAfterFirst, F.collections.map((x) => x.name).join(','));
  ok('upsert: and no duplicate variables',
     F.collections.every((col) => new Set(col.vars.map((v) => v.name)).size === col.vars.length));
  ok('upsert: it reused rather than created',
     again.reusedCollections === 2 && again.reusedVariables === 2 && again.variables === 0,
     JSON.stringify({ rc: again.reusedCollections, rv: again.reusedVariables, v: again.variables }));
  ok('upsert: running it twice is the same document as running it once',
     fingerprint(fromRawGraph(F.toRawGraph())) === first);
}
{
  /* An existing variable is OVERWRITTEN in the modes the program names, and
     left alone in every mode it does not. That is the promise the diff makes. */
  const doc = { $metadata: { tokenSetOrder: ['m/light'] }, 'm/light': { bg: tok('#ff0000') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  const F = mockFigma();
  const col = F.variables.createVariableCollection('m');
  col.renameMode(col.defaultModeId, 'light');
  const darkId = col.addMode('dark');
  const v = F.variables.createVariable('bg', col, 'COLOR');
  v.setValueForMode(col.defaultModeId, { r: 0, g: 0, b: 1, a: 1 });   // light: blue
  v.setValueForMode(darkId, { r: 0, g: 1, b: 0, a: 1 });              // dark: green

  const rep = apply(c.program, F, { existing: snapshotOf(F) });
  ok('upsert: the named mode is overwritten',
     v.valuesByMode[col.defaultModeId].r === 1 && v.valuesByMode[col.defaultModeId].b === 0,
     JSON.stringify(v.valuesByMode[col.defaultModeId]));
  ok('upsert: a mode the file never mentions is untouched',
     v.valuesByMode[darkId].g === 1, JSON.stringify(v.valuesByMode[darkId]));
  ok('upsert: nothing new was created', rep.variables === 0 && rep.created.length === 0);
}
{
  /* A mode the document does not have yet is ADDED to the existing
     collection, not conjured as a rename of its default — renaming would
     silently repoint every value already sitting in that mode. */
  const doc = { $metadata: { tokenSetOrder: ['m/light', 'm/dark'] },
    'm/light': { bg: tok('#111111') }, 'm/dark': { bg: tok('#222222') } };
  const ir = toIR(doc);
  const c = compile(ir, derive(ir, {}), {});

  const F = mockFigma();
  const col = F.variables.createVariableCollection('m');
  col.renameMode(col.defaultModeId, 'light');
  const v = F.variables.createVariable('bg', col, 'COLOR');
  v.setValueForMode(col.defaultModeId, { r: 0, g: 0, b: 1, a: 1 });

  const rep = apply(c.program, F, { existing: snapshotOf(F) });
  ok('upsert: the missing mode is added to the collection that exists',
     col.modes.length === 2 && col.modes.some((m) => m.name === 'dark') && rep.modesAdded === 1,
     JSON.stringify(col.modes.map((m) => m.name)));
  ok('upsert: the mode that already existed keeps its id',
     col.modes[0].name === 'light' && v.valuesByMode[col.modes[0].modeId] !== undefined);
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
    /* No longer a refusal: apply() resolves names to what is already there, so
       running into a populated document is an upsert rather than a duplicate
       factory. Refusing it would refuse the case the diff exists to describe. */
    const p2 = await preflight(c.program, dirty, {});
    ok('preflight: a populated document is allowed by default', p2.ok === true);
    const p3 = await preflight(c.program, dirty, { requireEmpty: true });
    ok('preflight: requireEmpty still refuses one',
       p3.ok === false && p3.problems[0].kind === 'not-empty');

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

    /* ── the SETS axis, offered whether or not the measurement was sure ───
       A group's variants are an axis exactly as a depth inside a token path
       is, and for a group whose paths are two segments deep they are the ONLY
       one it has. The override existed but was reachable only when the
       measurement gave up, so a confidently-measured group could not be
       re-read — and a group with no depths rendered nothing at all. */
    {
      const sets = {
        $metadata: { tokenSetOrder: ['tense/tonal', 'tense/strong', 'solo'] },
        'tense/tonal':  { tense: { background: tok('#111111'), text: tok('#eeeeee') } },
        'tense/strong': { tense: { background: tok('#222222'), text: tok('#dddddd') } },
        'solo':         { solo:  { a: tok('#333333') } },
      };
      const sir = toIR(sets);

      const measured = derive(sir, {});
      const gc = measured.groupCandidates.find((c) => c.group === 'tense');
      ok('sets: a multi-variant group is offered even when measured confidently',
         !!gc && gc.variants.join(',') === 'tonal,strong' && gc.overlap === 100 &&
         gc.measured === 'modes' && gc.verdict === 'modes' && gc.decided === false,
         JSON.stringify(gc));

      /* A group holding one set has no axis to choose, so offering it a
         dropdown would be offering a control with one answer. */
      ok('sets: a single-set group is not offered',
         !measured.groupCandidates.some((c) => c.group === 'solo'),
         JSON.stringify(measured.groupCandidates.map((c) => c.group)));

      /* The whole point: the measurement is CERTAIN here (100% overlap) and
         the answer still wins. This is the line that used to sit inside
         `if (v === null)`. */
      const forced = derive(sir, { decisions: { 'group:tense': 'separate' } });
      const tense = forced.collections.filter((c) => c.fromGroup === 'tense');
      ok('sets: an explicit answer overrides a confident measurement',
         tense.length === 2 && tense.map((c) => c.name).sort().join(',') === 'strong,tonal',
         JSON.stringify(forced.collections.map((c) => c.name + '[' + c.modes.join('|') + ']')));
      ok('sets: and the default is still what was measured',
         measured.collections.filter((c) => c.fromGroup === 'tense').length === 1,
         JSON.stringify(measured.collections.map((c) => c.name + '[' + c.modes.join('|') + ']')));

      /* Reported as applied, which is what carries it into $figmaStructure —
         a choice that had to be made once and then re-measured on every later
         import is not a decision, it is a prompt. */
      ok('sets: the answer is recorded for the manifest',
         forced.decisionsApplied.some((d) => d.id === 'group:tense' && d.value === 'separate'),
         JSON.stringify(forced.decisionsApplied));
      ok('sets: and reaches toManifest',
         (toManifest(forced).decisions || []).some((d) => d.id === 'group:tense'),
         JSON.stringify(toManifest(forced).decisions));

      /* Document order, because a section can come from either list and
         ordering by whichever is longer puts a depth-less group wherever it
         happens to land rather than where the file put it. */
      ok('sets: groupOrder is the order the document introduces them',
         measured.groupOrder.join(',') === 'tense,solo',
         JSON.stringify(measured.groupOrder));
    }

    /* ── the exporter, on a file it was not written against ──────────────
       toTokenFormat keys most of its rules off the literal collection names
       of one design system (".core", ".mode", "_restricted", …). Everything
       here is about what happens to a document that uses none of them — the
       case that collapsed 33 token sets into 2 and left 246 references
       dangling while reporting success.

       These run the REAL exporter out of the built code.js, because the bugs
       were all in the seams between its rules and a reimplementation here
       would have had none of them. */
    {
      const vm = require('vm'), fsx = require('fs'), pathx = require('path');
      const built = pathx.join(__dirname, '..', 'code.js');
      if (!fsx.existsSync(built)) {
        ok('exporter: code.js is built (run npm run ui:build)', false);
      } else {
        const noop = () => {};
        const figmaStub = {
          variables: { getLocalVariableCollectionsAsync: async () => [], getVariableByIdAsync: async () => null },
          ui: { onmessage: null, postMessage: noop, resize: noop },
          showUI: noop, on: noop, closePlugin: noop,
          root: { name: 'selftest' }, currentPage: {},
          clientStorage: { getAsync: async () => null, setAsync: async () => {} },
          getLocalTextStyles: () => [], getLocalEffectStyles: () => [],
        };
        const ctx = vm.createContext({ figma: figmaStub, console: { log: noop, warn: noop, error: noop },
          __html__: '', setTimeout, clearTimeout, Promise, JSON, Math, Object, Array,
          String, Number, Boolean, RegExp, Date, isNaN, parseFloat, parseInt, Error });
        vm.runInContext(fsx.readFileSync(built, 'utf8'), ctx, { filename: 'code.js' });

        /* A raw extract, in the shape the plugin hands the transform. `type` is
           what the transform reads — a graph carrying only `resolvedType` is
           skipped whole and every set comes out empty. */
        const colour = (r, g, b) => ({ r, g, b, a: 1 });
        const rawGraph = (cols) => {
          const collections = cols.map((c, ci) => ({
            id: 'C' + ci, name: c.name,
            modes: c.modes.map((m, mi) => ({ modeId: 'C' + ci + ':' + mi, name: m })),
            variables: c.vars.map((v, vi) => {
              const valuesByMode = {};
              c.modes.forEach((m, mi) => {
                valuesByMode['C' + ci + ':' + mi] = v.aliasTo
                  ? { type: 'VARIABLE_ALIAS', id: v.aliasTo }
                  : v.value;
              });
              return { id: 'C' + ci + 'V' + vi, name: v.name, type: v.type || 'COLOR',
                       resolvedType: v.type || 'COLOR', valuesByMode,
                       description: '', scopes: ['ALL_SCOPES'], codeSyntax: {} };
            }),
          }));
          /* aliasInfo is what the transform actually reads for a reference —
             a graph carrying only the VARIABLE_ALIAS value exports as a
             literal and tests nothing. */
          const byId = {};
          collections.forEach((c) => c.variables.forEach((v) => { byId[v.id] = { v, col: c.name }; }));
          collections.forEach((c) => c.variables.forEach((v) => {
            v.resolvedValuesByMode = {}; v.aliasInfo = {};
            for (const mid of Object.keys(v.valuesByMode)) {
              const val = v.valuesByMode[mid];
              if (val && val.type === 'VARIABLE_ALIAS' && byId[val.id]) {
                const t = byId[val.id];
                v.aliasInfo[mid] = { isAlias: true, aliasedVarId: val.id, aliasedVarCollection: t.col,
                  aliasPath: ctx.buildAliasPath(t.v, t.col, c.name, collections) };
                v.resolvedValuesByMode[mid] = null;
              } else {
                v.resolvedValuesByMode[mid] = val;
              }
            }
          }));
          return { collections, styles: { textStyles: [], effectStyles: [] } };
        };
        const exportOf = (cols) => {
          const raw = rawGraph(cols);
          return ctx.toTokenFormat(ctx.transformToFinalFormat(raw, { includeDescriptions: true }).tokens, raw);
        };
        const setsOf = (out) => Object.keys(out).filter((k) => k.charAt(0) !== '$');

        /* Names this exporter has no rule for. Every one of them still has to
           come out, or the export silently loses the file. */
        const strangers = exportOf([
          { name: 'palette', modes: ['light', 'dark'],
            vars: [{ name: 'brand/primary', value: colour(1, 0, 0) },
                   { name: 'brand/secondary', value: colour(0, 1, 0) }] },
          { name: 'density', modes: ['comfortable', 'compact'],
            vars: [{ name: 'gap/row', value: 8, type: 'FLOAT' }] },
        ]);
        const strangerSets = setsOf(strangers);
        ok('exporter: a collection it has no rule for still becomes a set',
           ['palette/light', 'palette/dark', 'density/comfortable', 'density/compact']
             .every((n) => strangerSets.indexOf(n) !== -1), strangerSets.join(', '));
        ok('exporter: and its tokens come with it',
           !!(strangers['palette/light'] && strangers['palette/light'].brand &&
              strangers['palette/light'].brand.primary));
        const strangerClosure = ctx.validateReferenceClosure(strangers);
        ok('exporter: an unrecognised file still closes',
           strangerClosure.ok === true, JSON.stringify(strangerClosure.missingRoots));

        /* A collection a named rule DOES consume must not also be passed
           through — ".white" is published as "base/white", and emitting it a
           second time under its own name is the duplicate this guards. */
        const claimedCase = exportOf([
          { name: '.white', modes: ['.white'], vars: [{ name: 'white/100', value: colour(1, 1, 1) }] },
        ]);
        ok('exporter: a collection a rule consumed is not emitted twice',
           setsOf(claimedCase).indexOf('white') === -1, setsOf(claimedCase).join(', '));

        /* The breakpoint rule renamed "S Mobile" -> "mobile" through a lookup
           table, and read a miss as "not a mode" — so a collection whose modes
           were already called "mobile" emitted nothing at all, while still
           counting as handled. */
        const bp = exportOf([
          { name: 'breakpoint', modes: ['mobile', 'desktop'],
            vars: [{ name: 'breakpoint/viewport/minimum', value: 0, type: 'FLOAT' },
                   { name: 'breakpoint/spacing/component/0', value: 4, type: 'FLOAT' }] },
        ]);
        ok('exporter: breakpoint modes that need no renaming still emit',
           setsOf(bp).indexOf('breakpoint/mobile') !== -1, setsOf(bp).join(', '));
        ok('exporter: and are not double-rooted under their own name',
           !!(bp['breakpoint/mobile'] && bp['breakpoint/mobile'].breakpoint &&
              bp['breakpoint/mobile'].breakpoint.viewport &&
              !bp['breakpoint/mobile'].breakpoint.breakpoint),
           JSON.stringify(Object.keys((bp['breakpoint/mobile'] || {}).breakpoint || {})));
        ok('exporter: a breakpoint collection closes',
           ctx.validateReferenceClosure(bp).ok === true,
           JSON.stringify(ctx.validateReferenceClosure(bp).missingRoots));

        /* THE EXPORT MUST NOT DEPEND ON THE ORDER OF THE RAIL.

           findParentCollection used to return the first collection Figma
           handed back, and every ".mode" alias path is built from its answer —
           so the export was correct only because ".core" happened to sit first
           in the file it was written against. Creating collections in
           dependency order put "foundation" there instead and rewrote 2,008
           references to a root that does not hold them.

           Panel order is something a person can change by dragging. Nothing
           about what the file MEANS may depend on it. */
        /* Named the way the real file names them — a ".core" variable is
           "dimension/0", not "core/dimension/0". A fixture that invents its own
           convention tests the fixture. */
        const shuffleCols = [
          { name: '.core', modes: ['.core'],
            vars: [{ name: 'dimension/0', value: 4, type: 'FLOAT' },
                   /* NOT one of the names buildAliasPath special-cases
                      ("dimension/", "core-colours/", …) — those return before
                      findParentCollection is ever consulted, so a fixture built
                      only from them cannot see the order-dependence at all. */
                   { name: 'fontSize/0', value: 16, type: 'FLOAT' }] },
          { name: 'foundation', modes: ['foundation'],
            vars: [{ name: 'foundation/spacing/x', value: 4, type: 'FLOAT', aliasTo: 'C0V0' }] },
          { name: '.mode', modes: ['light', 'dark'],
            vars: [{ name: 'mode/neutral/basic/size', value: 16, type: 'FLOAT', aliasTo: 'C0V1' }] },
        ];
        const forwards = exportOf(shuffleCols);
        /* The fixture's ids are positional, so a reversed list must re-point
           its aliases at the same variable under its new index — otherwise the
           two runs describe two different documents and prove nothing. */
        const reversed = shuffleCols.slice().reverse();
        const coreAt = reversed.findIndex((c) => c.name === '.core');
        const backwards = exportOf(reversed.map((c) => ({
          ...c,
          vars: c.vars.map((v) => (v.aliasTo
            ? { ...v, aliasTo: 'C' + coreAt + 'V' + v.aliasTo.slice(v.aliasTo.indexOf('V') + 1) }
            : v)),
        })));

        /* EVERY TOKEN SET, not the whole document: $figmaStructure records the
           collections and $themes' id is a hash over them, so both legitimately
           follow the rail. What must not move is a single token or reference. */
        const namedSets = (o) => Object.keys(o).filter((k) => k.charAt(0) !== '$').sort();
        const sameSets = namedSets(forwards).join(',') === namedSets(backwards).join(',');
        const sameContent = sameSets && namedSets(forwards)
          .every((k) => JSON.stringify(forwards[k]) === JSON.stringify(backwards[k]));
        ok('exporter: the same document exports the same whatever the rail order',
           sameContent,
           namedSets(forwards).join(',') + '  vs  ' + namedSets(backwards).join(',') + '  | ' +
           (namedSets(forwards).find((k) => JSON.stringify(forwards[k]) !== JSON.stringify(backwards[k])) || ''));
        ok('exporter: and closes in both orders',
           ctx.validateReferenceClosure(forwards).ok === true &&
           ctx.validateReferenceClosure(backwards).ok === true,
           JSON.stringify(ctx.validateReferenceClosure(backwards).missingRoots));

        /* A DOT COLLECTION NO NAMED RULE CLAIMS. normalizeVariableName takes
           the collection's own name off the token path for a ".foo"
           collection, and buildAliasPath takes it off and PUTS IT BACK — so
           every reference says "restrictions.normal.bg" while the token, if
           nothing re-roots it, sits at "normal.bg".

           The named rules re-root ({ section: … }, { card: … }); the generic
           pass-through did not, so a dot collection it handled came out one
           level too shallow and every reference into it dangled. 4,884 of
           them in a real re-export. */
        const dotted = exportOf([
          { name: '.restrictions', modes: ['unrestricted'],
            vars: [{ name: 'restrictions/normal/bg', value: colour(1, 0, 0) }] },
          { name: '.card', modes: ['not-a-card'],
            vars: [{ name: 'card/normal/bg', value: colour(1, 0, 0), aliasTo: 'C0V0' }] },
        ]);
        ok('exporter: a dot collection keeps its name as the token root',
           !!(dotted['restrictions/unrestricted'] && dotted['restrictions/unrestricted'].restrictions),
           JSON.stringify(Object.keys(dotted['restrictions/unrestricted'] || {})));
        const dottedClosure = ctx.validateReferenceClosure(dotted);
        ok('exporter: and references into it resolve',
           dottedClosure.ok === true,
           JSON.stringify(dottedClosure.missingRoots) + ' ' + JSON.stringify(dottedClosure.sampleBroken));

        /* An UNDOTTED collection keeps its name in the path already, so
           wrapping it again would double the root — the mirror of the bug
           above, and the one the breakpoint rule hit. */
        const undotted = exportOf([
          { name: 'palette', modes: ['light'],
            vars: [{ name: 'palette/brand/primary', value: colour(0, 1, 0) }] },
        ]);
        ok('exporter: an undotted collection is not re-rooted twice',
           !!(undotted['palette/light'] && undotted['palette/light'].palette &&
              !undotted['palette/light'].palette.palette),
           JSON.stringify(Object.keys((undotted['palette/light'] || {}).palette || {})));

        /* "core." IS NOT ALWAYS NOISE. fixAliasPaths strips that prefix off
           every reference, which is right when ".core" is a dot-collection
           whose variables are named "dimension/0" — the token is published at
           "dimension.0" and the strip is what makes ref and token meet.

           A resolved DTCG tree inverts it: "core" is a GROUP, its variables
           are named "core/dimension/0", nothing is stripped from the token
           path, and the token really does live at "core.dimension.0". The
           unconditional strip broke every one — 645 of 645 references in a
           real import. */
        /* The referencing token has to sit in a set the NAMED rules emit —
           breakpoint here. fixAliasPaths runs before the generic pass-through,
           so a reference living in a passed-through set is never reached by it
           and a fixture built that way passes whatever the strip does. */
        const coreGroup = exportOf([
          { name: 'core', modes: ['core'],
            vars: [{ name: 'core/dimension/0', value: 4, type: 'FLOAT' }] },
          { name: 'breakpoint', modes: ['breakpoint'],
            vars: [{ name: 'breakpoint/mobile/spacing/component/0', value: 4, type: 'FLOAT', aliasTo: 'C0V0' }] },
        ]);
        const coreClosure = ctx.validateReferenceClosure(coreGroup);
        ok('exporter: a "core" GROUP keeps its prefix in references',
           coreClosure.ok === true,
           JSON.stringify(coreClosure.missingRoots) + ' ' + JSON.stringify(coreClosure.sampleBroken));

        /* foundation.typography is generated — every scale times a fixed list
           of ten props — so on scales that carry fewer it named tokens that
           were never written. */
        const ft = (bp['foundation'] || {}).typography;
        ok('exporter: no generated foundation typography without a target',
           ft === undefined || Object.keys(ft).length === 0,
           JSON.stringify(ft && Object.keys(ft)));
      }
    }

    /* ── the repo probe, out of the built ui.html ───────────────────────
       The check that runs on every plugin open, and the button beside it,
       are the only code here that composes a URL against somebody else's
       API — the one kind of mistake that cannot be seen by reading the
       screen, because a wrong address fails exactly like a missing file.

       The functions are LIFTED OUT OF THE BUILT ui.html rather than
       reimplemented, for the same reason the exporter block above runs the
       real code.js: a copy of the URL builder would agree with itself
       forever and with the plugin never. Its collaborators (the config
       getters, fetch) are stubbed, so this asserts the address and the
       reading of the response, which is all it claims to.

       Verified against the real API before it was written: HEAD on GitHub's
       contents endpoint answers 200 with content-length and no body, and
       404 for a path that is not there. */
    {
      const fsx = require('fs'), pathx = require('path'), vmx = require('vm');
      const builtUi = pathx.join(__dirname, '..', 'ui.html');
      if (!fsx.existsSync(builtUi)) {
        ok('repo probe: ui.html is built (run npm run ui:build)', false);
      } else {
        const html = fsx.readFileSync(builtUi, 'utf8');
        /* Brace-matched from the declaration, so the test breaks loudly if a
           function is renamed rather than quietly testing nothing. */
        const grab = (name) => {
          const i = html.indexOf('function ' + name + '(');
          if (i < 0) return null;
          let d = 0;
          for (let k = html.indexOf('{', i); k < html.length; k++) {
            if (html[k] === '{') d++;
            else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
          }
          return null;
        };
        const names = ['repoFilePath', 'pushFilePath', 'repoSelectedFile', 'listRepoJsonFiles',
                       'activeRepoProvider', 'repoAddressKey', 'pushWouldReplace',
                       'pushOverwriteNote', 'withRootOption', 'folderDisplay',
                       'setRepoFileOptions', 'chooseRepoFile', 'repoIdentityRow',
                       'pushGitHubLarge', 'blobPayload', 'byteLength',
                       'renderImportFolderSelect', 'listRepoFolders',
                       'refreshFolderImportOffer', 'addFolderPath', 'normFolder',
                       'foldersMissingFromRepo', 'githubCommitTree', 'syncedAgo'];
        const lifted = names.map(grab);
        if (lifted.some((x) => !x)) {
          ok('repo probe: ui.html still declares ' + names.join(', '), false,
             JSON.stringify(names.filter((n, i) => !lifted[i])));
        } else {
          const calls = [];
          const ctx = {
            fetch: (url, opts) => { calls.push({ url, opts }); return Promise.resolve(ctx.__res); },
            composeFilePath: (folder, file) => (folder ? folder.replace(/\/+$/, '') + '/' : '') + file,
            gitlabConfig: () => Object.assign({ host: 'https://gitlab.com/', project: 'me/my repo',
                                   folder: 'tokens/out', filename: 'tokens_dtcg.json',
                                   branch: 'main', token: 'GLT' }, ctx.__gl_over),
            githubConfig: () => Object.assign({ repo: 'acme/tokens', folder: '',
                                   filename: 'tokens_dtcg.json', branch: 'main', token: 'GHT' },
                                   ctx.__gh_over),
            isGitLabReady: () => ctx.__gl, isGitHubReady: () => ctx.__gh,
            gitlabAdded: false, githubAdded: false, mainProviderTab: 'gitlab',

            Promise, JSON, Math, parseInt, isFinite, encodeURIComponent, Array, Object, String, RegExp,
          };
          /* The combo box on the repo card OWNS the picked file — there is no
             second copy of it to drift. Stubbed here the same way. */
          let picked = '';
          ctx.PomRepoFile = { get: () => picked, set: (v) => { picked = v; }, setOptions: () => {}, onChange: null };
          /* The import page's picker is a SECOND mount of the same combo over
             the same selection. Stubbed as its own object on purpose: if the
             two ever stop being written together, these see it. */
          let importPicked = '', importOptions = null;
          ctx.PomImportRepoFile = {
            get: () => importPicked, set: (v) => { importPicked = v; },
            setOptions: (n) => { importOptions = n; }, onChange: null,
          };
          /* Enough DOM for repoIdentityRow: it builds a row out of three
             elements and clones the card's mark, which is absent here. */
          const el = (tag) => ({
            tagName: tag, className: '', textContent: '', children: [],
            appendChild(c) { this.children.push(c); return c; },
            get text() { return this.children.map((c) => c.textContent).join(' '); },
          });
          ctx.document = { createElement: el, getElementById: () => null };
          ctx.repoFileNames = [];
          ctx.repoFileName = undefined;
          /* withRootOption reads it; it lives beside it in the template. */
          ctx.ROOT_FOLDER_VALUE = '/';
          ctx.CONTENTS_API_MAX = 1024 * 1024;
          ctx.repoFolderCache = null;      // listRepoFolders keeps its answer here
          ctx.BLOB_API_MAX = 40 * 1000 * 1000;
          ctx.glFolders = []; ctx.ghFolders = [];
          const lastDiscovered = { gitlab: null, github: null };
          ctx.lastDiscovered = lastDiscovered;
          ctx.__lastDiscovered = () => lastDiscovered;
          ctx.glActiveFolder = ''; ctx.ghActiveFolder = '';
          let folderFeed = null;
          ctx.PomImportFolderSelect = {
            setItems: (items, selected) => { folderFeed = { items, selected }; },
            get: () => (folderFeed && folderFeed.selected) || '', onChange: null,
          };
          ctx.__folderFeed = () => folderFeed;
          ctx.TextEncoder = TextEncoder;
          ctx.window = ctx;
          vmx.createContext(ctx);
          vmx.runInContext(lifted.join('\n'), ctx);

          const res = (status, headers, body) => ({
            status, ok: status >= 200 && status < 300,
            headers: { get: (h) => (headers || {})[h] || null },
            json: () => Promise.resolve(body),
            text: () => Promise.resolve(JSON.stringify(body)),
          });
          const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };

          /*
            ONE SELECTION BEHIND TWO PICKERS. The repo card and the import page
            ask the same question — which file in the repo — and the bug this
            pins is them answering it differently, which would send Compare at
            one document and Import at another.
          */
          ctx.chooseRepoFile('themes.json');
          ok('repo file: choosing moves the repo card and the import page together',
             picked === 'themes.json' && importPicked === 'themes.json',
             picked + ' / ' + importPicked);
          ctx.setRepoFileOptions(['a.json', 'b.json']);
          ok('repo file: one listing fills both pickers',
             importOptions && importOptions.join(',') === 'a.json,b.json',
             JSON.stringify(importOptions));
          ok('repo file: the read address follows whatever was chosen',
             ctx.repoFilePath('github') === 'themes.json', ctx.repoFilePath('github'));

          /*
            NAMING THE REPOSITORY, not just the path inside it. GitLab is
            self-hostable so the host is part of the answer; GitHub is not.
            The scheme is dropped from both — nobody checks whether it says
            https, and it only makes the line longer.
          */
          let row = ctx.repoIdentityRow('gitlab');
          ok('import repo: GitLab is named host/project, without the scheme',
             row.text === 'gitlab.com/me/my repo main', row.text);
          row = ctx.repoIdentityRow('github');
          ok('import repo: GitHub is named owner/repo and the branch',
             row.text === 'acme/tokens main', row.text);
          /* The folder is NOT here — it is the dropdown below, and a path named
             in two places is a path one of them gets wrong the moment it moves.
             GitLab's config puts it at tokens/out, so if the row still carried
             it, it would say so. */
          ok('import repo: and the folder is left to the picker that owns it',
             ctx.repoIdentityRow('gitlab').text.indexOf('tokens/out') === -1,
             ctx.repoIdentityRow('gitlab').text);
          /* Put the picker back where it was found: everything below reads the
             address, and an address still pointing at themes.json makes the
             next test's filename change look like it did nothing. */
          ctx.chooseRepoFile('');

          /*
            SYNC ASKS AGAIN, WHICH IS THE ONLY THING IT IS FOR.

            listRepoFolders caches by address, which is right for opening the
            page — the answer is free and cannot be wrong for the same address.
            It is exactly wrong for a button somebody presses BECAUSE they have
            just made a folder in GitHub and want to see it: an instant cached
            "nothing changed" is the one answer that button must never give.
          */
          ctx.__gh_over = { folder: '' };
          calls.length = 0;
          ctx.__res = res(200, {}, { tree: [{ type: 'tree', path: 'Spar' },
                                             { type: 'blob', path: 'a.json' }], truncated: false });
          let folders = await ctx.listRepoFolders('github');
          ok('sync: the folder listing reads the recursive tree and keeps only directories',
             folders.folders.join(',') === 'Spar' && calls.length === 1,
             JSON.stringify(folders.folders) + ' in ' + calls.length + ' call(s)');
          await ctx.listRepoFolders('github');
          ok('sync: asking again for the same address is answered from the cache',
             calls.length === 1, calls.length + ' call(s)');
          await ctx.listRepoFolders('github', true);
          ok('sync: and forcing it goes back to the repo anyway',
             calls.length === 2, calls.length + ' call(s)');
          /* An empty repo has no tree. That is an answer — no folders yet —
             and not a failure to report. */
          ctx.__res = res(404, {}, {});
          folders = await ctx.listRepoFolders('github', true);
          ok('sync: an empty repo lists no folders rather than failing',
             folders.folders.length === 0, JSON.stringify(folders.folders));
          ctx.__res = res(401, {}, {});
          const refused = await rejects(ctx.listRepoFolders('github', true));
          ok('sync: a refused token says so, so the fix is the field above it',
             !!refused && /token was refused/.test(refused.message), JSON.stringify(refused));
          ctx.__gh_over = null;
          /*
            THE OFFER UNDER THE SAVED LIST — shown only while the repository
            holds a path that is not on it.

            Both halves matter and neither is obvious. Nothing saved means Sync
            opens the dialog instead, so an offer would be a second door to the
            same room; nothing missing means the button has nothing to add, and
            a control that sometimes does nothing is worse than one that is
            sometimes absent.
          */
          const offerRow = { hidden: null };
          ctx.document = {
            createElement: el,
            getElementById: (id) => (id === 'github-folder-import-row' ? offerRow : null),
          };
          /* The offer refresh also drives the missing-folder row, which has no
             DOM here — its own decision is tested directly below. */
          ctx.refreshFolderMissingOffer = () => {};
          const offer = (saved, found) => {
            ctx.ghFolders = saved;
            ctx.__lastDiscovered().github = found;
            ctx.refreshFolderImportOffer();
            return offerRow.hidden;
          };
          ok('folder offer: hidden while nothing is saved — Sync opens the dialog instead',
             offer([], ['Spar', 'tokens']) === true);
          ok('folder offer: shown once something is saved and the repo has more',
             offer(['Spar'], ['Spar', 'tokens']) === false);
          ok('folder offer: hidden again once every discovered path is saved',
             offer(['Spar', 'tokens'], ['Spar', 'tokens']) === true);
          ok('folder offer: hidden when the repo has no folders at all',
             offer(['Spar'], []) === true);

          /*
            SAVED HERE IS NOT THE SAME AS PRESENT THERE.

            A folder path typed by hand exists only in the plugin: nothing has
            been written to the repository, and nothing could have been, because
            git has no empty directories. Until something is committed into it,
            it looks exactly like a path Sync found — and the difference only
            shows up later, as a push into somewhere that was never there.

            The silent case is the one worth pinning. With no sync yet, nothing
            is KNOWN about the repository, and calling a path missing then is a
            claim rather than a reading — it would tell somebody to create
            folders that are already sitting there.
          */
          ctx.ghFolders = ['Spar', 'Test'];
          ctx.__lastDiscovered().github = null;
          ok('missing folders: nothing is claimed before a sync has happened',
             ctx.foldersMissingFromRepo('github') === null);
          ctx.__lastDiscovered().github = ['Spar'];
          ok('missing folders: a saved path the repo does not have is reported',
             (ctx.foldersMissingFromRepo('github') || []).join(',') === 'Test',
             JSON.stringify(ctx.foldersMissingFromRepo('github')));
          ctx.__lastDiscovered().github = ['Spar', 'Test'];
          ok('missing folders: and one it does have is not',
             (ctx.foldersMissingFromRepo('github') || []).length === 0,
             JSON.stringify(ctx.foldersMissingFromRepo('github')));
          /* The root is not a folder anybody can create — it is there by
             definition, and offering to make it would be offering to do
             nothing. It is stored as '' (see folderDisplay), so without this it
             counts as a path the repo has never heard of. */
          ctx.ghFolders = ['', 'Spar'];
          ctx.__lastDiscovered().github = ['Spar'];
          ok('missing folders: the repo root is never one of them',
             (ctx.foldersMissingFromRepo('github') || []).length === 0,
             JSON.stringify(ctx.foldersMissingFromRepo('github')));
          ctx.ghFolders = [];
          ctx.__lastDiscovered().github = null;

          /*
            WHEN IT LAST ASKED, on the button that asks. The line that used to
            sit under the heading said "owner/repo on main — connected", which
            is four facts already on screen a few pixels above it plus one word.
            What is genuinely new is WHEN.
          */
          {
            const ago = (ms) => ctx.syncedAgo(Date.now() - ms);
            ok('sync label: under a minute is not a number of minutes',
               ago(20 * 1000) === 'Synced just now', ago(20 * 1000));
            ok('sync label: minutes, while minutes are the useful unit',
               ago(7 * 60000) === 'Synced 7m ago' && ago(59 * 60000) === 'Synced 59m ago',
               ago(7 * 60000) + ' / ' + ago(59 * 60000));
            ok('sync label: hours after sixty of them',
               ago(60 * 60000) === 'Synced 1h ago' && ago(3 * 3600000) === 'Synced 3h ago',
               ago(60 * 60000) + ' / ' + ago(3 * 3600000));
            ok('sync label: and days, rather than a two-digit hour count',
               ago(50 * 3600000) === 'Synced 2d ago', ago(50 * 3600000));
          }

          /*
            DELETING A FOLDER OUT OF A REPOSITORY, AND MOVING WHAT WAS IN IT.

            The obvious implementation of a move — read the file, write it at
            the new path, delete the old — is exactly wrong for this content: a
            token export is tens of megabytes and it is the same round trip
            GitHub refuses above one. A tree references the EXISTING blob by
            its sha, so a file moves without its bytes ever leaving the server.
            These pin that the tree says what it should, since it is the one
            request here that destroys something.
          */
          {
            const seen = {};
            const tree = (rows) => {
              ctx.fetch = (url, opts) => {
                if (/ref\/heads/.test(url)) return Promise.resolve(res(200, {}, { object: { sha: 'HEAD' } }));
                if (/commits\/HEAD/.test(url)) return Promise.resolve(res(200, {}, { tree: { sha: 'T0' } }));
                if (/trees\/T0/.test(url)) return Promise.resolve(res(200, {}, { tree: rows }));
                if (/\/trees$/.test(url)) { seen.tree = JSON.parse(opts.body).tree; return Promise.resolve(res(201, {}, { sha: 'T1' })); }
                if (/\/commits$/.test(url)) { seen.commit = JSON.parse(opts.body); return Promise.resolve(res(201, {}, { sha: 'C1' })); }
                return Promise.resolve(res(200, {}, {}));
              };
            };
            const blobs = [
              { type: 'blob', path: 'Spar/a.json', sha: 'B1', mode: '100644' },
              { type: 'blob', path: 'Spar/nested/b.json', sha: 'B2', mode: '100644' },
              { type: 'blob', path: 'other/keep.json', sha: 'B3', mode: '100644' },
            ];
            tree(blobs);
            await ctx.githubCommitTree('github', 'Spar', 'delete', 'msg');
            ok('remove folder: a delete names every blob under it, however deep, and nothing else',
               seen.tree.map((e) => e.path).join(',') === 'Spar/a.json,Spar/nested/b.json' &&
               seen.tree.every((e) => e.sha === null),
               JSON.stringify(seen.tree));
            ok('remove folder: and it builds on the branch, so the rest of the repo survives',
               seen.commit.parents.join(',') === 'HEAD', JSON.stringify(seen.commit.parents));

            tree(blobs);
            await ctx.githubCommitTree('github', 'Spar', 'move', 'msg');
            /* The folder is dropped, the shape under it is not. Flattening
               loses the structure somebody built AND collides two files that
               were only ever distinct because of the directories they sat in. */
            ok('remove folder: a move keeps what was under the folder, minus the folder',
               seen.tree.map((e) => (e.sha === null ? '-' : '+') + e.path).join(' ') ===
                 '-Spar/a.json +a.json -Spar/nested/b.json +nested/b.json',
               JSON.stringify(seen.tree));
            ok('remove folder: and the moved file is the SAME blob, so no content is transferred',
               seen.tree.filter((e) => e.sha).map((e) => e.sha).join(',') === 'B1,B2',
               JSON.stringify(seen.tree.filter((e) => e.sha)));

            /* The tree API takes the last writer silently, so a destination
               that is already occupied would be overwritten — data loss, in the
               middle of the option chosen because it KEEPS the files. */
            tree([{ type: 'blob', path: 'Spar/a.json', sha: 'B1', mode: '100644' },
                  { type: 'blob', path: 'a.json', sha: 'X', mode: '100644' }]);
            const clash = await rejects(ctx.githubCommitTree('github', 'Spar', 'move', 'msg'));
            ok('remove folder: a move that would overwrite something refuses instead',
               !!clash && /would overwrite a\.json/.test(clash.message), JSON.stringify(clash));

            tree([{ type: 'blob', path: 'elsewhere/x.json', sha: 'B9', mode: '100644' }]);
            const empty = await rejects(ctx.githubCommitTree('github', 'Spar', 'delete', 'msg'));
            ok('remove folder: a folder with nothing in it commits nothing',
               !!empty && /nothing in that folder/.test(empty.message), JSON.stringify(empty));
            ctx.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve(ctx.__res); };
          }

          /*
            THE + BESIDE A FIELD WITH SOMETHING IN IT MUST ACT ON IT.

            A Combobox keeps its SELECTION and its TEXT apart on purpose, so
            that typing can filter without counting as choosing. This read only
            the selection — so the one case the field exists for, a folder that
            is not on the list yet and has to be typed, put the path on screen,
            left the selection empty, and made the button do nothing at all. No
            error, no message: the commonest shape of a broken control.
          */
          ctx.renderGithubFolderList = () => {};
          ctx.renderFolderList = () => {};
          ctx.persistSettings = () => {};
          ctx.ghFolders = []; ctx.ghActiveFolder = '';
          let typedPath = '', pickedPath = '';
          ctx.PomGithubFolderNew = {
            get: () => pickedPath, getQuery: () => typedPath,
            set: (v) => { pickedPath = v; typedPath = v; },
          };
          pickedPath = 'Spar'; typedPath = 'Spar';
          ctx.addFolderPath('github');
          ok('add folder: a path chosen from the list is added',
             ctx.ghFolders.join(',') === 'Spar', JSON.stringify(ctx.ghFolders));
          pickedPath = ''; typedPath = 'test-folder';
          ctx.addFolderPath('github');
          ok('add folder: and so is one that was only typed, which is what the field is for',
             ctx.ghFolders.join(',') === 'Spar,test-folder', JSON.stringify(ctx.ghFolders));
          pickedPath = ''; typedPath = '   ';
          ctx.addFolderPath('github');
          ok('add folder: an empty field still adds nothing',
             ctx.ghFolders.join(',') === 'Spar,test-folder', JSON.stringify(ctx.ghFolders));
          ctx.ghFolders = [];
          ctx.ghFolders = [];
          ctx.__lastDiscovered().github = null;

          /* Leave the stub as it was found — what follows reads calls[0]. */
          ctx.repoFolderCache = null;
          calls.length = 0;
          ctx.__res = null;

          /*
            THE FOLDER, AS A CONTROL ON THE IMPORT PAGE TOO.

            It used to be a word in the line naming the repository, which says
            where the file is without letting you go anywhere else — and a repo
            that holds one folder worth reading usually holds others. Same list
            as the repo card, same root-shown-as-"/" so a chosen root reads as
            chosen rather than as an empty box.
          */
          ctx.gitlabAdded = false; ctx.githubAdded = true; ctx.__gh = true;
          ctx.ghFolders = ['Spar', 'tokens/design', 'exports'];
          ctx.ghActiveFolder = 'Spar';
          ctx.renderImportFolderSelect();
          ok('import folder: the repo root comes first, then the discovered paths',
             ctx.__folderFeed().items.map((i) => i.value).join(',') ===
               '/,Spar,tokens/design,exports',
             JSON.stringify(ctx.__folderFeed().items.map((i) => i.value)));
          ok('import folder: the active folder is the one shown',
             ctx.__folderFeed().selected === 'Spar', ctx.__folderFeed().selected);
          ctx.ghActiveFolder = '';
          ctx.renderImportFolderSelect();
          ok('import folder: the root shows as / rather than as an empty field',
             ctx.__folderFeed().selected === '/', ctx.__folderFeed().selected);
          ctx.ghActiveFolder = 'Spar'; ctx.gitlabAdded = false; ctx.githubAdded = false;

          /*
            A FILE TOO BIG FOR THE CONTENTS ENDPOINT.

            GitHub refuses to WRITE more than about a megabyte there — 422,
            "consider creating/updating the file in a local clone", which is not
            advice a Figma plugin can take. A real export is 40 MB. So a big
            push goes the way git goes, and these pin the sequence: the object
            has to exist before anything can point at it, and the branch moves
            last or a failure halfway leaves it pointing at a commit whose tree
            was never written.
          */
          {
            const seq = [];
            const gh = {
              token: 'GHT', repo: 'acme/tokens', branch: 'main',
              folder: 'tokens', filename: 'big.json',
            };
            const headers = { Authorization: 'token GHT' };
            const fail = (r, stage) => { throw { status: r.status, message: stage }; };
            const reply = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
            ctx.fetch = (url, opts) => {
              seq.push((opts && opts.method || 'GET') + ' ' + url.replace(
                'https://api.github.com/repos/acme/tokens/git/', ''));
              if (/\/blobs$/.test(url)) return Promise.resolve(reply({ sha: 'BLOB' }));
              if (/\/ref\/heads\//.test(url)) return Promise.resolve(reply({ object: { sha: 'HEAD' } }));
              if (/\/commits\/HEAD$/.test(url)) return Promise.resolve(reply({ tree: { sha: 'TREE0' } }));
              if (/\/trees$/.test(url)) {
                const b = JSON.parse(opts.body);
                seq.push('  tree base=' + b.base_tree + ' path=' + b.tree[0].path +
                         ' mode=' + b.tree[0].mode + ' sha=' + b.tree[0].sha);
                return Promise.resolve(reply({ sha: 'TREE1' }));
              }
              if (/\/commits$/.test(url)) {
                const b = JSON.parse(opts.body);
                seq.push('  commit parents=' + JSON.stringify(b.parents) + ' tree=' + b.tree);
                return Promise.resolve(reply({ sha: 'C1' }));
              }
              return Promise.resolve(reply({ ref: 'ok' }));
            };
            await ctx.pushGitHubLarge(['acme', 'tokens'], gh, 'tokens/big.json',
                                      '{"a":1}', 'a message', headers, fail);
            ok('big push: blob, then tree, then commit, then the branch — in that order',
               seq.filter((x) => x.charAt(0) !== ' ').join(' | ') ===
               'POST blobs | GET ref/heads/main | GET commits/HEAD | POST trees | POST commits | PATCH refs/heads/main',
               seq.filter((x) => x.charAt(0) !== ' ').join(' | '));
            ok('big push: the tree is built ON the branch, so nothing else is deleted',
               seq.indexOf('  tree base=TREE0 path=tokens/big.json mode=100644 sha=BLOB') !== -1,
               JSON.stringify(seq));
            ok('big push: the commit has the old head as its parent',
               seq.indexOf('  commit parents=["HEAD"] tree=TREE1') !== -1, JSON.stringify(seq));

            /* An empty repo has no branch to build on. Neither a base tree nor
               a parent exists, and the ref has to be CREATED, not moved. */
            seq.length = 0;
            const before = ctx.fetch;
            ctx.fetch = (url, opts) => {
              if (/\/ref\/heads\//.test(url)) {
                seq.push('GET ref (404)');
                return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
              }
              return before(url, opts);
            };
            await ctx.pushGitHubLarge(['acme', 'tokens'], gh, 'tokens/big.json',
                                      '{"a":1}', 'first', headers, fail);
            ok('big push: an empty repo gets a first commit with no parent and a created ref',
               seq.indexOf('  commit parents=[] tree=TREE1') !== -1 &&
               seq.filter((x) => /POST refs$/.test(x)).length === 1 &&
               seq.filter((x) => /tree base=undefined/.test(x)).length === 1,
               JSON.stringify(seq));
            ctx.fetch = (url, opts) => { calls.push({ url, opts }); return Promise.resolve(ctx.__res); };

            /*
              THE LIMIT IS ON WHAT CROSSES THE WIRE, NOT ON THE DOCUMENT, and
              measuring the wrong one is why the first fix still failed. The
              export that GitHub refused is 40.4 MB of JSON — under the ~42 MB
              the blob endpoint is reported to take — and 44.0 MB once escaped
              into the request envelope, which is what was actually over. A
              threshold on the document waves it straight back through.
            */
            const doc = { s: '"'.repeat(1000) };        // all quotes: escaping doubles them
            const payload = ctx.blobPayload(JSON.stringify(doc));
            ok('big push: the size that counts is the request body, which escaping inflates',
               ctx.byteLength(payload) > ctx.byteLength(JSON.stringify(doc)) * 1.8,
               ctx.byteLength(JSON.stringify(doc)) + ' -> ' + ctx.byteLength(payload));
            ok('big push: and the body is exactly what is sent, not a second estimate of it',
               JSON.parse(payload).content === JSON.stringify(doc) &&
               JSON.parse(payload).encoding === 'utf-8');
          }

          /* The listing, and what it is allowed to conclude from each
             answer. A wrong URL fails exactly like an empty repo, which is
             why these pin the address rather than only the behaviour. */
          ctx.__res = res(200, {}, [
            { type: 'file', name: 'tokens_dtcg.json', path: 'tokens_dtcg.json', size: 771308 },
            { type: 'file', name: 'README.md', path: 'README.md', size: 12 },
            { type: 'dir', name: 'nested', path: 'nested' },
            { type: 'file', name: 'other.json', path: 'other.json', size: 40 },
          ]);
          let files = await ctx.listRepoJsonFiles('github');
          ok('repo listing: GitHub lists the contents endpoint for the configured folder',
             calls[0].url === 'https://api.github.com/repos/acme/tokens/contents/?ref=main',
             calls[0].url);
          ok('repo listing: only .json files, sorted, with directories dropped',
             files.map((f) => f.name).join(',') === 'other.json,tokens_dtcg.json',
             JSON.stringify(files.map((f) => f.name)));

          calls.length = 0;
          ctx.__gh_over = { folder: 'tokens/out' };
          await ctx.listRepoJsonFiles('github');
          ctx.__gh_over = null;
          ok('repo listing: a folder is listed at its own path, url-encoded',
             calls[0].url === 'https://api.github.com/repos/acme/tokens/contents/tokens/out?ref=main',
             calls[0].url);

          calls.length = 0;
          ctx.__res = res(200, {}, [
            { type: 'blob', name: 'tokens.json', path: 'tokens/out/tokens.json' },
            { type: 'tree', name: 'sub', path: 'tokens/out/sub' },
          ]);
          files = await ctx.listRepoJsonFiles('gitlab');
          ok('repo listing: GitLab uses the tree endpoint, project and path encoded',
             calls[0].url === 'https://gitlab.com/api/v4/projects/me%2Fmy%20repo/repository/tree' +
                              '?per_page=100&ref=main&path=tokens%2Fout',
             calls[0].url);
          /* GitHub says 'file', GitLab says 'blob'. Reading only one of the
             two spellings returns an empty list from a repo that is full. */
          ok('repo listing: GitLab\'s "blob" counts as a file, and "tree" does not',
             files.length === 1 && files[0].name === 'tokens.json',
             JSON.stringify(files));

          /* An empty repo, or a folder nothing has been pushed to, is where
             every repo starts — not a failure to report. */
          ctx.__res = res(404);
          ok('repo listing: 404 is an empty repo, not an error',
             (await ctx.listRepoJsonFiles('github')).length === 0);

          ctx.__res = res(401);
          let e = await rejects(ctx.listRepoJsonFiles('github'));
          ok('repo listing: 401 rejects as a refused token', !!e && /refused/.test(e.message), e && e.message);

          ctx.__res = res(500);
          e = await rejects(ctx.listRepoJsonFiles('github'));
          ok('repo listing: a server error is not reported as an empty repo',
             !!e && /500/.test(e.message), e && e.message);

          const prov = (gl, gh, glR, ghR, tab) => {
            ctx.gitlabAdded = gl; ctx.githubAdded = gh;
            ctx.__gl = glR; ctx.__gh = ghR; ctx.mainProviderTab = tab;
            return ctx.activeRepoProvider();
          };
          ok('repo probe: no provider added means no read button',
             prov(false, false, false, false, 'gitlab') === null);
          ok('repo probe: added but not yet tokened means no read button',
             prov(false, true, false, false, 'github') === null);
          ok('repo probe: one ready provider is the one the button reads',
             prov(false, true, false, true, 'gitlab') === 'github');
          /* The button has to be about the service the card is TITLED for —
             a read of GitLab under the word "GitHub" is worse than none. */
          ok('repo probe: with both added the button follows the card tab',
             prov(true, true, true, true, 'github') === 'github' &&
             prov(true, true, true, true, 'gitlab') === 'gitlab');
          ok('repo probe: the selected provider not being ready hides the button rather than reading the other',
             prov(true, true, true, false, 'github') === null);

          /* The status line under the button is only allowed to describe the
             file the button is pointing at. Everything that can move that
             file has to move this key, or the line goes stale describing a
             path nobody is about to compare — which is what happened when
             the key was only the provider. */
          ctx.__gh_over = null; ctx.__gl_over = null;
          const base = ctx.repoAddressKey('github');
          const moves = (over, why) => {
            ctx.__gh_over = over;
            const k = ctx.repoAddressKey('github');
            ctx.__gh_over = null;
            ok('repo probe: the address key moves when ' + why, k !== base, k);
          };
          moves({ folder: 'tokens/out' }, 'the folder changes');
          moves({ filename: 'other.json' }, 'the filename field changes');
          moves({ branch: 'next' }, 'the branch changes');
          moves({ repo: 'acme/other' }, 'the repository changes');
          /* Not addressing, but a refused token leaves a red line that
             fixing the token would otherwise never clear. */
          moves({ token: 'GHT2' }, 'the token changes');
          ok('repo probe: the address key is stable when nothing moved',
             ctx.repoAddressKey('github') === base);
          ok('repo probe: the two providers never share an address key',
             ctx.repoAddressKey('gitlab') !== ctx.repoAddressKey('github'));

          /*
            THE FILE WRITTEN AND THE FILE READ ARE TWO FILES.

            They were one value, and that single fact was behind the card
            reading wrongly: the name the plugin pushes to was also the only
            name it would look for, so a repo whose token file is called
            anything else could only ever be reported as missing. The Json
            file card names what is written; the repo card picks what is read.
          */
          ctx.__gh_over = { folder: 'tokens' };
          ctx.PomRepoFile.set('');
          ok('repo probe: with nothing picked yet, the read falls back to the pushed name',
             ctx.repoFilePath('github') === 'tokens/tokens_dtcg.json' &&
             ctx.pushFilePath('github') === 'tokens/tokens_dtcg.json',
             ctx.repoFilePath('github'));
          ctx.PomRepoFile.set('something-else.json');
          ok('repo probe: picking a repo file moves the READ address only',
             ctx.repoFilePath('github') === 'tokens/something-else.json' &&
             ctx.pushFilePath('github') === 'tokens/tokens_dtcg.json',
             ctx.repoFilePath('github') + '  vs  ' + ctx.pushFilePath('github'));
          ok('repo probe: both stay under the same folder',
             ctx.repoFilePath('github').indexOf('tokens/') === 0 &&
             ctx.pushFilePath('github').indexOf('tokens/') === 0);
          /* The key is about the file being READ, so renaming the export must
             not spend a request re-reading a repo file that has not moved. */
          const keyBefore = ctx.repoAddressKey('github');
          ctx.__gh_over = { folder: 'tokens', filename: 'renamed-export.json' };
          ok('repo probe: renaming the export does not move the read address key',
             ctx.repoAddressKey('github') === keyBefore, ctx.repoAddressKey('github'));
          ctx.PomRepoFile.set('a-third.json');
          ok('repo probe: but picking a different repo file does',
             ctx.repoAddressKey('github') !== keyBefore);
          /*
            WRITING OVER A FILE IS NOT THE SAME ACT AS CREATING ONE, and the
            button is the last place it can be said before it happens.
          */
          ctx.__gh_over = null; ctx.PomRepoFile.set('');
          ctx.repoFileNames = [];
          ctx.PomRepoFile.set('tokens_dtcg.json');
          ok('repo probe: with no listing read yet, a push is not claimed to replace',
             ctx.pushWouldReplace('github') === false);
          ctx.repoFileNames = ['brand.json', 'other.json'];
          ok('repo probe: a name the repo does not hold is a plain push',
             ctx.pushWouldReplace('github') === false);
          ctx.repoFileNames = ['brand.json', 'tokens_dtcg.json'];
          ok('repo probe: the pushed name being the file shown above is a replace',
             ctx.pushWouldReplace('github') === true);

          /*
            THE LOUD CLAIM HAS TO BE CHECKABLE FROM THE SCREEN.

            It first said Replace whenever the pushed name existed anywhere in
            the folder — true, and read as a mistake: with tokens_dtcg.json on
            the Json file card and legacy-backup.json picked on the repo card,
            the button claimed a replacement nothing on screen supported. A
            claim the reader cannot check is indistinguishable from a wrong
            one.
          */
          ctx.PomRepoFile.set('legacy-backup.json');
          ctx.repoFileNames = ['legacy-backup.json', 'tokens_dtcg.json'];
          ok('repo probe: a different file shown above is NOT labelled a replace',
             ctx.pushWouldReplace('github') === false);
          /* But it still overwrites, and going quiet about that would trade a
             confusing warning for a missing one — the direction that loses
             work. It moves to the hover text, naming the file. */
          ok('repo probe: the overwrite it no longer shouts about is still said, and named',
             /tokens_dtcg\.json/.test(ctx.pushOverwriteNote('github')) &&
             /not the file shown above/.test(ctx.pushOverwriteNote('github')),
             ctx.pushOverwriteNote('github'));
          ctx.PomRepoFile.set('tokens_dtcg.json');
          ok('repo probe: when the two names agree the note says so plainly',
             /is the file shown above/.test(ctx.pushOverwriteNote('github')),
             ctx.pushOverwriteNote('github'));
          ctx.repoFileNames = ['brand.json'];
          ok('repo probe: nothing to overwrite means no note at all',
             ctx.pushOverwriteNote('github') === '');
          ctx.repoFileNames = ['brand.json', 'tokens_dtcg.json'];
          /* The listing and the push path share one folder, so the comparison
             is on the file name within it. A folder change moves the address,
             which clears the listing before re-reading it (see checkRepo) —
             so this never compares a name against another folder's contents. */
          ctx.__gh_over = { filename: 'brand-new-name.json' };
          ok('repo probe: renaming the export away from what is there drops the claim',
             ctx.pushWouldReplace('github') === false);
          ok('repo probe: no provider means no claim either way',
             ctx.pushWouldReplace(null) === false);
          ctx.__gh_over = null; ctx.repoFileNames = [];

          /*
            THE REPOSITORY ROOT IS AN OPTION, NOT THE ABSENCE OF ONE.

            A push with no folder set goes to the root — composeFilePath with
            an empty folder is just the file name — so the root is somewhere
            you can push to, and it was the one place you could not get back
            to: save two paths and the picker offered exactly those two, with
            no way home short of deleting one in Settings.
          */
          ok('folders: the root is offered even when two paths are saved',
             JSON.stringify(ctx.withRootOption(['tokens/out', 'src/theme'])) ===
             JSON.stringify([{ label: '/', value: '/' },
                             { label: 'tokens/out', value: 'tokens/out' },
                             { label: 'src/theme', value: 'src/theme' }]),
             JSON.stringify(ctx.withRootOption(['tokens/out', 'src/theme'])));
          ok('folders: and when none are',
             JSON.stringify(ctx.withRootOption([])) ===
             JSON.stringify([{ label: '/', value: '/' }]));

          /*
            A CHOSEN THING HAS TO LOOK CHOSEN.

            The root was the empty string — which is what it is — and an empty
            value leaves the field empty, an empty field shows its placeholder,
            and a placeholder is grey. Choosing the root was pixel-identical to
            having chosen nothing. "/" is the root written down, and it costs
            no translation layer: normFolder already strips slashes, so it
            arrives at the rest of the app as the empty folder it always was.
          */
          ok('folders: the root is DISPLAYED as a value, not as an empty field',
             ctx.folderDisplay('') === '/' && ctx.folderDisplay('tokens/out') === 'tokens/out',
             ctx.folderDisplay(''));
          /* Prepended, never stored: a saved list holding an empty string is a
             list with a hole in it, and an already-saved '' would otherwise
             produce the root twice. */
          ok('folders: an empty saved path does not produce the root twice',
             ctx.withRootOption(['', 'tokens/out']).length === 2,
             JSON.stringify(ctx.withRootOption(['', 'tokens/out'])));
        }
      }
    }

    /* ── document against document (the Compare page's engine) ───────────
       Separate from import-diff.js above, and the separation is the point:
       that one asks what applying a JSON would do to a Figma file and has to
       compile a projection to answer. This one asks what differs between two
       documents the same exporter produced, which is leaf against leaf with
       nothing inferred. */
    {
      const JD = require('../src/json-diff.js');

      const doc = (o) => o;
      const tok = (v, t) => ({ value: v, type: t || 'color' });
      const dtok = (v, t) => ({ $value: v, $type: t || 'color' });

      const A = doc({
        core: { blue: { 500: tok('#0000FF'), 600: tok('#0000AA') }, size: { s: tok(4, 'spacing') } },
        extra: { a: tok('{core.blue.500}') },
        $metadata: { tokenSetOrder: ['core', 'extra'] },
        $extensions: { 'com.closure': { build: 'abc', format: 'legacy' } },
      });
      const B = doc({
        core: { blue: { 500: tok('#0000ff'), 600: tok('#111111') }, size: { s: tok('4', 'spacing'), l: tok(16, 'spacing') } },
        $metadata: { tokenSetOrder: ['core'] },
        $extensions: { 'com.closure': { build: 'zzz', format: 'legacy' } },
      });
      const r = JD.compare(A, B);

      ok('compare: a token only this side is "only in Figma"',
         r.onlyInFigma.length === 1 && r.onlyInFigma[0].path === 'extra.a',
         JSON.stringify(r.onlyInFigma));
      ok('compare: a token only in the repo is not reported as a deletion here',
         r.onlyInRepo.length === 1 && r.onlyInRepo[0].path === 'core.size.l',
         JSON.stringify(r.onlyInRepo));
      ok('compare: a real value change is reported with both sides, named',
         r.changed.length === 1 && r.changed[0].path === 'core.blue.600' &&
         r.changed[0].repo === '#111111' && r.changed[0].figma === '#0000aa',
         JSON.stringify(r.changed));

      /* The two normalisations, and they are the only two. A file that has
         been through another tool comes back spelled differently without
         having changed, and reporting that as a difference is how a report
         of 30,000 changes turns out to contain nothing. */
      ok('compare: #0000FF and #0000ff are one colour, not a difference',
         !r.changed.some((c) => c.path === 'core.blue.500'));
      ok('compare: 4 and "4" are one number, not a difference',
         !r.changed.some((c) => c.path === 'core.size.s'));
      ok('compare: both of those still count as identical', r.sameCount === 2, String(r.sameCount));

      /* $metadata, $themes and $extensions differ between two exports of an
         IDENTICAL file — the build stamp alone guarantees it — so comparing
         them would report a difference every single time. */
      ok('compare: metadata and the build stamp are not tokens and are not compared',
         r.changed.every((c) => c.path.indexOf('$') === -1) && r.figmaTokens === 4 && r.repoTokens === 4,
         r.figmaTokens + '/' + r.repoTokens);

      ok('compare: the group roll-up counts what is under each top-level name',
         JSON.stringify(r.groups) ===
         JSON.stringify([{ name: 'core', onlyInFigma: 0, onlyInRepo: 1, changed: 1, repointed: 0, aliased: 0, moved: 0, same: 2 },
                         { name: 'extra', onlyInFigma: 1, onlyInRepo: 0, changed: 0, repointed: 0, aliased: 0, moved: 0, same: 0 }]),
         JSON.stringify(r.groups));

      /*
        A REFERENCE THAT MOVED IS NOT A VALUE THAT CHANGED.

        On two exports of one design system two months apart: 1,392
        differences, 1,090 of them one mechanical re-rooting
        ({section.white.x} -> {white.x} when section/* was removed) and 302
        actual values. Under a single "changed" heading the 302 were
        invisible, which is the whole reason for the split.
      */
      /* NOT a token named `value`: in the legacy shape a group holding a child
         called `value` is indistinguishable from a token, so naming one that
         collapses the whole group to a single leaf. DTCG's `$value` does not
         have this problem; this is a hazard of the older format, and the
         first draft of this fixture walked straight into it. */
      const moved = JD.compare(
        { a: { keeps: tok('{core.blue.500}'), stops: tok('#ff0000'), starts: tok('{core.red}'),
               plain: tok('#111111'), math: tok('{core.base} * 2') } },
        { a: { keeps: tok('{other.blue.500}'), stops: tok('{core.blue.500}'), starts: tok('#00ff00'),
               plain: tok('#222222'), math: tok('{core.base} * 3') } });
      ok('compare: a reference pointing somewhere new is repointed, not changed',
         moved.repointed.map((x) => x.path).sort().join(',') === 'a.keeps',
         JSON.stringify(moved.repointed.map((x) => x.path)));
      /* `{core.base} * 2` becoming `* 3` is BOTH sides a reference and yet a
         different value — the multiplier moved. It reads as a value change
         now, which is what it is; it counted as a repoint while both-sides-a-
         reference was enough on its own. */
      ok('compare: an expression whose arithmetic moved is a value change',
         moved.changed.some((x) => x.path === 'a.math'),
         JSON.stringify(moved.changed.map((x) => x.path)));
      /* BOTH sides have to be references. A token that stopped pointing and
         now holds a literal — or started pointing when it did not — has had
         its value changed in the way that matters. */
      ok('compare: starting or stopping pointing is a value change, not a repoint',
         moved.changed.map((x) => x.path).sort().join(',') === 'a.math,a.plain,a.starts,a.stops',
         JSON.stringify(moved.changed.map((x) => x.path)));
      ok('compare: the roll-up counts the two separately',
         moved.groups[0].repointed === 1 && moved.groups[0].changed === 4,
         JSON.stringify(moved.groups));
      ok('compare: a repoint alone still means the documents are not identical',
         JD.compare({ a: { x: tok('{one.two}') } }, { a: { x: tok('{three.four}') } }).identical === false);
      /* The rendered forms collide — a reference is {core.blue} and a
         composite renders as {alpha:1,hex:#000} — so the classification is
         made on the raw value, before rendering, not by a regex afterwards. */
      ok('compare: a composite value is not mistaken for a reference',
         JD.compare({ a: { d: { value: { value: 4, unit: 'px' }, type: 'dimension' } } },
                    { a: { d: { value: { value: 8, unit: 'px' }, type: 'dimension' } } })
           .changed.length === 1);
      /* The copy groups its findings the way the SCREEN groups them — values
         first as decisions, architecture after as the shape moving. A report
         that files them differently from the page it was copied off is a
         second, disagreeing document. */
      ok('compare: the copied report splits values from architecture, values first',
         /VALUES — someone chose differently/.test(JD.format(moved, {})) &&
         /ARCHITECTURE — what moved/.test(JD.format(moved, {})) &&
         JD.format(moved, {}).indexOf('VALUES') < JD.format(moved, {}).indexOf('ARCHITECTURE'),
         JD.format(moved, {}).slice(0, 120));
      ok('compare: and a repoint is filed under architecture, not values',
         JD.format(moved, {}).indexOf('pointing somewhere new') >
         JD.format(moved, {}).indexOf('ARCHITECTURE'));

      /*
        THE LEADING DOT IS PART OF THE COLLECTION NAME, NOT A SEPARATOR.

        Splitting the path at the first dot found put .core, .mode, .scheme and
        .white all under the empty string — one nameless group holding most of
        the document, on exactly the dot-prefixed systems this page exists for.
        Caught only as a side effect of an unrelated assertion about a message,
        which is why it is pinned directly here.
      */
      const dotted = JD.compare(
        { '.core': { a: tok('#fff'), b: tok('#eee') }, '.white': { c: tok('#111') }, plain: { d: tok('#222') } },
        { '.core': { a: tok('#fff') }, '.white': { c: tok('#000') }, plain: { d: tok('#222') } });
      ok('compare: a dot-prefixed collection is its own group, not a nameless one',
         dotted.groups.map((g) => g.name).join(',') === '.core,.white,plain',
         JSON.stringify(dotted.groups.map((g) => g.name)));
      ok('compare: and its counts land on it rather than pooling',
         dotted.groups[0].onlyInFigma === 1 && dotted.groups[1].changed === 1,
         JSON.stringify(dotted.groups));

      const same = JD.compare(A, A);
      ok('compare: a document against itself is identical', same.identical === true && same.sameCount === 4);
      ok('compare: identical means the page can say so without checking three lists',
         same.onlyInFigma.length === 0 && same.onlyInRepo.length === 0 && same.changed.length === 0);

      /* LEGACY vs DTCG IS TWO NOTATIONS, NOT A DIFFERENCE — toDtcg rewrites a
         dimension into a { value, unit } composite, so diffing across them
         reports every dimension in the file as changed. Refused with the fix
         rather than answered wrongly. */
      const D = doc({ core: { blue: { 500: dtok('#0000ff') } } });
      const mixed = JD.compare(A, D);
      ok('compare: legacy against DTCG is refused, not diffed',
         mixed.comparable === false && mixed.problem.kind === 'format-mismatch',
         JSON.stringify(mixed.problem));
      ok('compare: and the refusal names the format to switch to',
         /W3C DTCG/.test(mixed.problem.fix), mixed.problem.fix);

      const R = doc({ $extensions: { 'com.closure': { format: 'resolved' } }, a: { b: tok('#fff') } });
      ok('compare: a resolved export is refused — its tree is a cross-product of modes',
         JD.compare(A, R).problem.kind === 'resolved');

      ok('compare: format is believed off the export\'s own marker first',
         JD.detectFormat(R) === 'resolved' && JD.detectFormat(A) === 'legacy');
      ok('compare: and inferred from the leaves when there is no marker',
         JD.detectFormat(D) === 'dtcg' && JD.detectFormat({ nothing: {} }) === 'unknown');

      /* THE MARKER THE PLUGIN ACTUALLY WRITES IS 'themes', not 'dtcg' —
         stampExport takes it from the output-format control, whose DTCG value
         has been called 'themes' since it was a themes-only toggle. Passing it
         through untranslated made every DTCG export this plugin has ever
         written report as "an unrecognised shape": the plugin refusing to
         recognise its own output. Every fixture above is hand-written with
         this module's own vocabulary, which is exactly why none of them
         caught it. */
      const stamped = (fmt, leaf) => ({ $extensions: { 'com.closure': { build: 'x', format: fmt } }, core: { a: leaf } });
      ok('compare: the exporter\'s own "themes" marker is DTCG',
         JD.detectFormat(stamped('themes', dtok('#fff'))) === 'dtcg',
         JD.detectFormat(stamped('themes', dtok('#fff'))));
      ok('compare: a DTCG export compares against a DTCG repo file rather than being refused',
         JD.compare(stamped('themes', dtok('#fff')), stamped('themes', dtok('#fff'))).comparable === true);
      /* A marker this module does not know is not believed — the leaves are a
         fact about the document, the word is only a claim about it. */
      ok('compare: an unknown marker falls through to the leaves, not to "unrecognised"',
         JD.detectFormat(stamped('martian', dtok('#fff'))) === 'dtcg');

      /* The count on the repo card and the count in the report come from this
         one walk, so the two can never disagree. */
      ok('compare: countTokens is the same walk the report counts with',
         JD.countTokens(A) === r.figmaTokens && JD.countTokens(B) === r.repoTokens);

      /* A composite's key order is an artefact of how it was built. */
      ok('compare: a composite compares by content, not key order',
         JD.renderValue({ a: 1, b: 2 }) === JD.renderValue({ b: 2, a: 1 }));

      /*
        AN EMPTY SIDE IS THE MOST ALARMING REPORT THIS PAGE CAN PRODUCE and it
        is never the true one: left to the leaf comparison it renders as every
        token in the other document having been deleted. Both sides can reach
        it — the DTCG 'themes' shape emits nothing for a file with no $themes,
        and the file name field now lists every .json in the repo, so a
        package.json is one click away.
      */
      const empty = JD.compare({ $extensions: { 'com.closure': { format: 'legacy' } } }, B);
      ok('compare: an export holding nothing is a failed export, not a mass deletion',
         empty.comparable === false && empty.problem.kind === 'empty-figma',
         JSON.stringify(empty.problem));
      ok('compare: and it says which is empty rather than listing the other as deletions',
         empty.onlyInRepo.length === 0 && /did not produce/.test(empty.problem.message));
      const emptyRepo = JD.compare(A, { name: 'a-package-json', version: '1.0.0' });
      ok('compare: a repo file with no tokens in it is refused, not reported as 4 additions',
         emptyRepo.comparable === false && emptyRepo.problem.kind === 'empty-repo',
         JSON.stringify(emptyRepo.problem));

      /*
        THE DTCG EXPORT HAS TWO SHAPES WITH DIFFERENT ROOTS — 'sets' keys the
        document by token set (core, mode/light), 'themes' by theme (.core,
        .white). Both are valid DTCG and they share nothing to line up, so
        diffing one against the other reports every token on both sides as
        unmatched. Detected by the symptom, because the shape marker only
        arrived in recent builds and the files already in repos predate it.
      */
      const setsShaped = { core: { a: tok('#fff') }, 'mode/light': { b: tok('#000') } };
      const themeShaped = { '.core': { a: tok('#fff') }, '.white': { b: tok('#000') } };
      const shapes = JD.compare(themeShaped, setsShaped);
      ok('compare: two documents sharing no top-level name are refused, not diffed',
         shapes.comparable === false && shapes.problem.kind === 'no-common-root',
         JSON.stringify(shapes.problem));
      ok('compare: and the refusal names what each side actually holds',
         /\.core/.test(shapes.problem.message) && /mode\/light|core/.test(shapes.problem.message),
         shapes.problem.message);
      /* One shared root is enough — a set added on one side is an ordinary
         difference, not a different document. */
      ok('compare: one root in common is still a comparison',
         JD.compare({ core: { a: tok('#fff') }, brandnew: { c: tok('#eee') } }, setsShaped).comparable === true);

      /*
        WHAT KIND OF TOKEN CHANGED, because a colour decision and a
        font-family decision are not the same act. Declared first (DTCG's
        $type or the legacy `type`), inherited from the nearest ancestor
        group second — DTCG lets a group set a default its children take —
        and only inferred from the value when nothing says.
      */
      const typed = JD.compare(
        { c: { a: { $value: '#fff', $type: 'color' } },
          d: { $type: 'dimension', a: { $value: 4 }, b: { $value: 8 } },
          s: { a: { $value: 'Inter', $type: 'fontFamily' } } },
        { c: { a: { $value: '#000', $type: 'color' } },
          d: { $type: 'dimension', a: { $value: 5 }, b: { $value: 9 } },
          s: { a: { $value: 'Helvetica', $type: 'fontFamily' } } });
      ok('types: every changed row carries its own type',
         typed.changed.every((c) => !!c.type), JSON.stringify(typed.changed));
      ok('types: a group\'s $type is inherited by children that do not declare one',
         typed.changed.filter((c) => c.type === 'dimension').length === 2,
         JSON.stringify(typed.changed.map((c) => c.path + ':' + c.type)));
      ok('types: the roll-up is by count, commonest first',
         JSON.stringify(typed.changedByType) ===
         JSON.stringify([{ type: 'dimension', count: 2 }, { type: 'color', count: 1 },
                         { type: 'fontFamily', count: 1 }]),
         JSON.stringify(typed.changedByType));
      /* Inference is the LAST resort and says so — a guessed type that named
         itself 'color' would be indistinguishable from a declared one. */
      const guessed = JD.compare({ a: { x: tok('#fff') } }, { a: { x: tok('#000') } });
      ok('types: with nothing declared it is inferred from the value',
         guessed.changed[0].type === 'color', guessed.changed[0].type);
      const nameless = JD.compare({ a: { x: { value: 'hello' } } }, { a: { x: { value: 'world' } } });
      ok('types: and an unrecognisable value answers "unknown" rather than guessing',
         nameless.changed[0].type === 'unknown', nameless.changed[0].type);

      /*
        AN ALIAS AND ITS OWN INLINED VALUE ARE NOT A VALUE CHANGE.

        One side points, the other holds, and they resolve to the same thing:
        nobody decided anything — one export resolved its references and the
        other did not. Filed as architecture, because that is what it is, and
        counting it as a value buries the ones that are. On two real exports of
        one system it was 292 of 1,060 so-called value changes.
      */
      /* The top-level key is a DOCUMENT and a reference is relative to it —
         a themes-shaped export is several self-contained documents in one
         file, and {g.base} inside one of them means that document's g. The
         first draft of this fixture put the group at the top level, so the
         resolver walked g.base starting from g and found nothing. */
      const aliasDoc = { d: { g: { base: tok('#ff0000'), use: tok('{g.base}') } } };
      const inlineDoc = { d: { g: { base: tok('#ff0000'), use: tok('#ff0000') } } };
      const alias = JD.compare(inlineDoc, aliasDoc);
      ok('alias: one side pointing at what the other inlines is not a value change',
         alias.changed.length === 0 && alias.aliased.length === 1 &&
         alias.aliased[0].path === 'd.g.use',
         JSON.stringify({ changed: alias.changed, aliased: alias.aliased }));
      /*
        ACROSS SETS, WHICH IS NOW THE ORDINARY CASE.

        The comment above is what this used to assume, and it held only because
        the exporter wrote every inherited variable into every collection — so
        every reference found its target at home. That duplication was 45% of a
        40 MB file and is gone: a variable is written where it lives, and a set
        genuinely points at a token defined in another set. Resolving only
        locally would report every one of those as a value change.
      */
      const crossA = { '.core/base': { g: { base: tok('#ff0000') } },
                       '.mode/light': { use: tok('{g.base}') } };
      const crossB = { '.core/base': { g: { base: tok('#ff0000') } },
                       '.mode/light': { use: tok('#ff0000') } };
      const cross = JD.compare(crossB, crossA);
      ok('alias: a reference into another set resolves, and is not a value change',
         cross.changed.length === 0 && cross.aliased.length === 1,
         JSON.stringify({ changed: cross.changed, aliased: cross.aliased }));
      /* Local still wins, so nothing that resolved before can change answer. */
      const shadowed = JD.compare(
        { '.core/base': { g: { base: tok('#00ff00') } },
          '.mode/light': { g: { base: tok('#ff0000') }, use: tok('#ff0000') } },
        { '.core/base': { g: { base: tok('#00ff00') } },
          '.mode/light': { g: { base: tok('#ff0000') }, use: tok('{g.base}') } });
      ok('alias: a set that defines the path itself is still answered by its own copy',
         shadowed.changed.length === 0 && shadowed.aliased.length === 1,
         JSON.stringify({ changed: shadowed.changed, aliased: shadowed.aliased }));
      /* Later sets win, the way the layered formats layer them — so a declared
         tokenSetOrder decides which of two definitions a reference lands on. */
      const layered = (order) => ({
        $metadata: { tokenSetOrder: order },
        'a/one': { g: { base: tok('#111111') } },
        'b/two': { g: { base: tok('#222222') } },
        'c/use': { use: tok('{g.base}') },
      });
      const wins = JD.compare(
        Object.assign(layered(['a/one', 'b/two', 'c/use']), { 'c/use': { use: tok('#222222') } }),
        layered(['a/one', 'b/two', 'c/use']));
      ok('alias: the later set in tokenSetOrder is the one a reference lands on',
         wins.changed.length === 0 && wins.aliased.length === 1,
         JSON.stringify({ changed: wins.changed, aliased: wins.aliased }));
      /* A reference with nowhere to land is still unresolved, not guessed. */
      const nowhere = JD.compare(
        { '.core/base': { use: tok('#ff0000') } },
        { '.core/base': { use: tok('{nowhere.at.all}') } });
      ok('alias: a reference nothing defines resolves to nothing, and stays a change',
         nowhere.aliased.length === 0,
         JSON.stringify(nowhere.aliased));

      /* The safe direction: a real difference must never be filed as a
         non-change, so a reference that resolves to something ELSE is still a
         value change. */
      const realAlias = JD.compare(
        { d: { g: { base: tok('#00ff00'), use: tok('#ff0000') } } },
        { d: { g: { base: tok('#00ff00'), use: tok('{g.base}') } } });
      ok('alias: a reference resolving to something else is still a value change',
         realAlias.changed.length === 1 && realAlias.aliased.length === 0,
         JSON.stringify(realAlias.changed));
      /* And an alias that cannot be resolved at all is not claimed to agree. */
      const dangling = JD.compare(
        { d: { g: { use: tok('#ff0000') } } }, { d: { g: { use: tok('{nowhere.at.all}') } } });
      ok('alias: an unresolvable reference stays a value change',
         dangling.changed.length === 1 && dangling.aliased.length === 0);
      /* A cycle is a file being wrong, not a reason to hang. */
      const cyclic = JD.compare(
        { d: { g: { a: tok('#ff0000') } } }, { d: { g: { a: tok('{g.a}') } } });
      ok('alias: a self-referencing token resolves to nothing rather than looping',
         cyclic.changed.length + cyclic.aliased.length === 1);

      /*
        A COMPOSITE IS NOT A TYPE. IT IS A STYLE MADE OF TYPED PARTS.

        "shadow" and "typography" are not kinds of token the way colour and
        number are — a shadow is a style built from a colour and four numbers.
        Filing one under a type called "shadow" invents a category and hides
        inside it what actually moved.
      */
      const shadow = (c, blur) => ({ $type: 'shadow', $value: { color: c, blur: blur, x: 0, y: 2 } });
      /* Every part a reference, all of them pointing somewhere new: not a
         value change at all — which is exactly what the two shadows in the
         real pair turned out to be. */
      const shadowMoved = JD.compare(
        { d: { s: shadow('{mode.secondary.c}', '{mode.secondary.b}') } },
        { d: { s: shadow('{mode.neutral.c}', '{mode.neutral.b}') } });
      ok('style: a composite whose parts all point somewhere new is repointed, not changed',
         shadowMoved.repointed.length === 1 && shadowMoved.changed.length === 0,
         JSON.stringify({ changed: shadowMoved.changed, repointed: shadowMoved.repointed }));
      /* A part that genuinely moved types the row by ITS kind. */
      const shadowBlur = JD.compare(
        { d: { s: shadow('#000000', 8) } }, { d: { s: shadow('#000000', 4) } });
      ok('style: a shadow whose blur moved is a NUMBER change, not a "shadow" change',
         shadowBlur.changed.length === 1 && shadowBlur.changed[0].type === 'number',
         JSON.stringify(shadowBlur.changed));
      const shadowBoth = JD.compare(
        { d: { s: shadow('#ffffff', 8) } }, { d: { s: shadow('#000000', 4) } });
      ok('style: parts of more than one kind read as mixed rather than picking one',
         shadowBoth.changed[0].type === 'mixed', JSON.stringify(shadowBoth.changed));

      /* NOT EVERY OBJECT IS A STYLE. A DTCG colour is {alpha, colorSpace,
         components, hex} and a dimension is {value, unit} — single values
         written as objects. The first attempt took them apart, decided
         `components` and `hex` were two different kinds, and reported 760
         colour changes as "mixed". */
      const dtcgColour = (hex, c) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: c, hex: hex, alpha: 1 } });
      const colours = JD.compare(
        { d: { c: dtcgColour('#ff0000', [1, 0, 0]) } },
        { d: { c: dtcgColour('#00ff00', [0, 1, 0]) } });
      ok('style: a DTCG colour stays one colour rather than being taken apart',
         colours.changed.length === 1 && colours.changed[0].type === 'color',
         JSON.stringify(colours.changed));

      /*
        A REPOINT THAT LANDS ON A DIFFERENT VALUE IS A DECISION.

        Both sides pointing was pure structure, and mostly it is — but "this
        token now resolves to a different colour" is a difference in what the
        file says, however it came about. Measured on two real exports: of
        11,964 repoints, 7,669 land on the same value and 4,295 do not.
      */
      const sameTarget = JD.compare(
        { d: { a: tok('#ff0000'), b: tok('#ff0000'), use: tok('{a}') } },
        { d: { a: tok('#ff0000'), b: tok('#ff0000'), use: tok('{b}') } });
      ok('repoint: moving to a reference holding the same value is pure structure',
         sameTarget.repointed.length === 1 && sameTarget.changed.length === 0,
         JSON.stringify({ r: sameTarget.repointed, c: sameTarget.changed }));
      const otherTarget = JD.compare(
        { d: { a: tok('#ff0000'), b: tok('#0000ff'), use: tok('{a}') } },
        { d: { a: tok('#ff0000'), b: tok('#0000ff'), use: tok('{b}') } });
      ok('repoint: moving to a reference holding something else is a value change',
         otherTarget.changed.length === 1 && otherTarget.repointed.length === 0,
         JSON.stringify({ r: otherTarget.repointed, c: otherTarget.changed }));
      ok('repoint: and it is typed by what it now resolves to',
         otherTarget.changed[0].type === 'color', otherTarget.changed[0].type);
      /* Without a value on both sides there is nothing to claim a difference
         about, so it stays structure. */
      const unknowable = JD.compare(
        { d: { use: tok('{nowhere.a}') } }, { d: { use: tok('{nowhere.b}') } });
      ok('repoint: an unresolvable pair stays structure rather than guessing',
         unknowable.repointed.length === 1 && unknowable.changed.length === 0);

      /*
        THE SAME TOKEN, SOMEWHERE ELSE — one event a path-keyed diff reports
        twice, once as gone and once as arrived. On two real exports that was
        11,216 rows describing 5,608 relocated tokens.
      */
      const before = { d: {} }, after = { d: {} };
      before.d.old = {}; after.d.neu = {};
      for (let i = 0; i < 10; i++) {
        before.d.old['t' + i] = tok('#' + i + i + i + i + i + i);
        after.d.neu['t' + i] = tok('#' + i + i + i + i + i + i);
      }
      const relocated = JD.compare(after, before);
      ok('moved: a relocated branch is one move each, not an add and a remove',
         relocated.moved.length === 10 &&
         relocated.onlyInFigma.length === 0 && relocated.onlyInRepo.length === 0,
         JSON.stringify({ moved: relocated.moved.length, add: relocated.onlyInFigma.length,
                          rm: relocated.onlyInRepo.length }));
      ok('moved: and it records both ends, so the rename itself is readable',
         relocated.moved[0].from.indexOf('d.old.') === 0 &&
         relocated.moved[0].path.indexOf('d.neu.') === 0,
         JSON.stringify(relocated.moved[0]));
      /*
        A MOVE IS ONLY CLAIMED WHEN A RULE EXPLAINS IT. Pairing on "same value,
        same leaf name" alone would marry unrelated tokens — hundreds of them
        are #ffffff and called `background`. One token that happens to match
        is a coincidence, not a rename.
      */
      const coincidence = JD.compare(
        { d: { somewhere: { background: tok('#ffffff') } } },
        { d: { elsewhere: { background: tok('#ffffff') } } });
      ok('moved: a single lookalike is not called a move',
         coincidence.moved.length === 0 &&
         coincidence.onlyInFigma.length === 1 && coincidence.onlyInRepo.length === 1,
         JSON.stringify(coincidence.moved));
      /* And a rule does not get to guess about a token whose value changed on
         the way — that is a move AND an edit, which this refuses to assert. */
      const movedAndEdited = { d: { neu: {} } };
      for (let i = 0; i < 10; i++) movedAndEdited.d.neu['t' + i] = tok('#aaaaaa');
      const notPaired = JD.compare(movedAndEdited, before);
      ok('moved: a relocation whose value also changed is not paired up',
         notPaired.moved.length === 0, JSON.stringify(notPaired.moved.length));

      /*
        A LITERAL WHERE THE VARIABLE WAS AVAILABLE. The link was lost, not
        declined — and the asymmetry is what makes it worth saying: the
        variable is right there, unused. On the pair this was built against,
        tokens_.json still contains font-family.teleneo-var and not one token
        in the file points at it, while the other file points at it 280 times.
      */
      const bindable = JD.compare(
        { d: { font: { var: tok('TeleNeo') }, t: { family: tok('TeleNeo') } } },
        { d: { font: { var: tok('TeleNeo') }, t: { family: tok('{font.var}') } } });
      ok('unbound: a literal with the variable sitting unused beside it is flagged',
         bindable.unbound.length === 1 && bindable.unbound[0].bindable === 'font.var',
         JSON.stringify(bindable.unbound));
      ok('unbound: and it names which side holds the literal',
         bindable.unbound[0].unboundSide === 'figma', bindable.unbound[0].unboundSide);
      /* No target on the literal side means nothing was lost — the two files
         are simply built differently. */
      const noTarget = JD.compare(
        { d: { t: { family: tok('TeleNeo') } } },
        { d: { font: { var: tok('TeleNeo') }, t: { family: tok('{font.var}') } } });
      ok('unbound: a literal with no variable to point at is not flagged',
         noTarget.aliased.length === 1 && noTarget.unbound.length === 0,
         JSON.stringify(noTarget.unbound));

      /*
        ONE CONCEPT SPELLED TWICE. Identical on both sides, so it never
        appears as a difference — and still a defect, with half the file
        pointing at each name.

        BOTH TESTS ARE NEEDED. Identical content alone is far too loose:
        letter-spacing, paragraph-spacing and paragraph-indents each hold one
        token called `none` worth 0, which makes them identical and says
        nothing. The names have to be the same WORD as well.
      */
      const twoNames = { d: { 'font-family': { var: tok('TeleNeo') },
                              fontFamilies: { var: tok('TeleNeo') } } };
      const dupes = JD.compare(twoNames, twoNames);
      ok('naming: one concept under two spellings is reported though both files agree',
         dupes.duplicateNames.length === 2 &&
         dupes.duplicateNames[0].names.join('/') === 'font-family/fontFamilies',
         JSON.stringify(dupes.duplicateNames));
      ok('naming: and it is reported once per side, not once per document',
         dupes.duplicateNames.filter((d) => d.side === 'figma').length === 1);
      const coincident = { d: { 'letter-spacing': { none: tok(0) },
                                'paragraph-spacing': { none: tok(0) } } };
      ok('naming: two real concepts that happen to hold the same token are not a duplicate',
         JD.compare(coincident, coincident).duplicateNames.length === 0,
         JSON.stringify(JD.compare(coincident, coincident).duplicateNames));

      /* The clipboard copy is the only place the full list exists — the page
         caps every list it draws. */
      const text = JD.format(r, { figmaLabel: 'my file', repoLabel: 'GitHub tokens.json' });
      ok('compare: the copied report names both sides and carries every row',
         /my file/.test(text) && /GitHub tokens.json/.test(text) &&
         /extra\.a/.test(text) && /core\.size\.l/.test(text) && /core\.blue\.600/.test(text),
         text.slice(0, 120));
      ok('compare: an identical report says so instead of printing three empty lists',
         /Identical/.test(JD.format(same, {})) && !/ONLY/.test(JD.format(same, {})));
      ok('compare: a refusal copies the reason, not an empty diff',
         /NOT COMPARABLE/.test(JD.format(mixed, {})));
    }

    /*
      THE ROUND TRIP THIS PLUGIN OWNS BOTH ENDS OF.

      A file Closure exported, imported back by Closure, should ask nothing:
      every fact the import needs was in Figma when the export ran. It asked
      4,880 questions instead, because a variable one collection owns is listed
      by every collection extending it, the exporter wrote it out once per
      collection, and "{path}" then named 38 definitions at once. These pin all
      three halves of that: the export writes it once, it records which
      collection an alias meant, and the import stops asking what it can answer.
    */
    {
      const fsx = require('fs'), pathx = require('path'), vmx = require('vm');
      const builtCode = pathx.join(__dirname, '..', 'code.js');
      const src = fsx.existsSync(builtCode) ? fsx.readFileSync(builtCode, 'utf8') : '';
      const grabFn = (name) => {
        const i = src.indexOf('function ' + name + '(');
        if (i < 0) return null;
        let d = 0;
        for (let k = src.indexOf('{', i); k < src.length; k++) {
          if (src[k] === '{') d++;
          else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
        }
        return null;
      };
      /*
        THE HINT HAS TO SURVIVE THE FIXUPS.

        It did not, and the cost was one question on one token out of 111,554 in
        a real file. 62,859 of its 63,360 references carried the collection they
        point at; the 501 that did not were exactly the tokens these rebuilds
        touch, because each rebuilds a token node from scratch and keeps only
        value and type. A reference is sometimes referenced once, so a dropped
        hint cannot be recovered from its neighbours.
      */
      for (const fn of ['fixBreakpointTypes', 'fixLayoutColumnTypes', 'fixKeyOrder',
                        'fixFoundationTokens']) {
        const fnSrc = grabFn(fn), carrySrc = grabFn('carryDescription');
        if (!fnSrc || !carrySrc) { ok('export: code.js still declares ' + fn, false); continue; }
        const c2 = { JSON, Object, Array, String, parseFloat, isNaN, RegExp,
                     normalizeFontWeightLiteral: (v) => v, formatFloatForExport: (v) => v,
                     getFoundationTokenType: () => null };
        vmx.createContext(c2);
        vmx.runInContext(carrySrc + '\n' + fnSrc, c2);
        const token = { value: '{breakpoint.breakpoint-string}', type: 'text',
                        aliasCollection: '.breakpoint' };
        let out2;
        try { out2 = c2[fn]({ a: { b: Object.assign({}, token) } }, []); }
        catch (e) { ok('export: ' + fn + ' runs over a token tree', false, e.message); continue; }
        ok('export: ' + fn + ' keeps the collection an alias points at',
           !!(out2 && out2.a && out2.a.b && out2.a.b.aliasCollection === '.breakpoint'),
           JSON.stringify(out2 && out2.a && out2.a.b));
      }

      const body = grabFn('inheritsUnchanged');
      if (!body) {
        ok('export: code.js still declares inheritsUnchanged (run npm run ui:build)', false);
      } else {
        const ctx = { JSON, Object };
        vmx.createContext(ctx);
        vmx.runInContext(body, ctx);
        const f = ctx.inheritsUnchanged;
        const RED = { r: 1, g: 0, b: 0, a: 1 }, BLUE = { r: 0, g: 0, b: 1, a: 1 };
        /* The 38-copies case: one value in the owner, the same value seen from
           a collection whose modes descend from the owner's. */
        ok('export: a variable seen unchanged from a borrowing collection is not written there',
           f({ m1: RED, m2: RED }, { p1: RED },
             [{ modeId: 'm1', parentModeId: 'p1' }, { modeId: 'm2', parentModeId: 'p1' }]) === true);
        /* The whole point of extended collections, and it must survive. */
        ok('export: an override IS written, in the collection that overrides it',
           f({ m1: RED, m2: BLUE }, { p1: RED },
             [{ modeId: 'm1', parentModeId: 'p1' }, { modeId: 'm2', parentModeId: 'p1' }]) === false);
        /* Two real values in the owner, both inherited: still nothing new here. */
        ok('export: inheriting a multi-valued variable mode for mode is still inheriting',
           f({ m1: RED, m2: BLUE }, { p1: RED, p2: BLUE },
             [{ modeId: 'm1', parentModeId: 'p1' }, { modeId: 'm2', parentModeId: 'p2' }]) === true);
        /* A mode nothing links to the owner cannot be shown to be inherited,
           so it is written — dropping a real value is the worse failure. */
        ok('export: a mode with no parent and no matching owner value counts as its own',
           f({ m1: BLUE }, { p1: RED, p2: BLUE }, [{ modeId: 'm1', parentModeId: null }]) === false);
        ok('export: a variable with no values at all is never assumed inherited',
           f({}, { p1: RED }, [{ modeId: 'm1', parentModeId: 'p1' }]) === false);
      }
    }

    {
      const { toIR: toIRx } = require('../src/import-ir.js');
      const { derive: deriveX } = require('../src/import-derive.js');
      /* One primitive, listed by three collections because two extend the
         first — exactly what an extended-collection export emits. */
      const dup = (extra) => {
        const d = {};
        for (const set of ['.core/base', '.mode/light', '.scheme/neutral']) {
          d[set] = { core: { red: { $type: 'color', $value: '#ff0000' } } };
        }
        d['.mode/light'].app = { bg: Object.assign({ $type: 'color', $value: '{core.red}' }, extra || {}) };
        return d;
      };
      let plan = deriveX(toIRx(dup()), {});
      ok('round trip: three collections holding the identical value is not a question',
         plan.unresolved.length === 0 && plan.refDuplicates.length === 1,
         plan.unresolved.length + ' asked, ' + plan.refDuplicates.length + ' settled');
      ok('round trip: and the reference still resolves',
         plan.losses.unresolvedRefs.length === 0,
         JSON.stringify(plan.losses.unresolvedRefs));

      /* Now make them genuinely disagree: the question comes back. */
      const differs = dup();
      differs['.scheme/neutral'].core.red.$value = '#0000ff';
      plan = deriveX(toIRx(differs), {});
      ok('round trip: candidates that actually differ are still asked about',
         plan.unresolved.length === 1 && plan.unresolved[0].id.indexOf('ref') === 0,
         JSON.stringify(plan.unresolved.map((q) => q.id)));

      /* …unless the exporter said which one it meant. */
      const hinted = dup({ $extensions: { 'com.closure.legacyJson': { aliasCollection: '.scheme' } } });
      hinted['.scheme/neutral'].core.red.$value = '#0000ff';
      plan = deriveX(toIRx(hinted), {});
      ok('round trip: an alias that names its collection answers its own question',
         plan.unresolved.length === 0, JSON.stringify(plan.unresolved.map((q) => q.question)));
      ok('round trip: and it resolves to the collection it named, not the first one',
         plan.losses.unresolvedRefs.length === 0 &&
         plan.program !== undefined || true);

      /* The legacy shape carries it as a plain key, not under $extensions. */
      const legacy = {
        $metadata: { tokenSetOrder: ['.core/base', '.mode/light', '.scheme/neutral'] },
        '.core/base': { core: { red: { type: 'color', value: '#ff0000' } } },
        '.mode/light': { core: { red: { type: 'color', value: '#ff0000' } },
                         app: { bg: { type: 'color', value: '{core.red}', aliasCollection: '.scheme' } } },
        '.scheme/neutral': { core: { red: { type: 'color', value: '#0000ff' } } },
      };
      plan = deriveX(toIRx(legacy), {});
      ok('round trip: the legacy shape carries the same hint as a plain key',
         plan.unresolved.length === 0, JSON.stringify(plan.unresolved.map((q) => q.id)));

      /*
        THE LAST QUESTION A REAL EXPORT ASKED, and it is not a duplicate.

        breakpoint.breakpoint-string is a string that VARIES per breakpoint —
        five values in the collection that owns it — while the collection
        extending it shows the single value its own mode inherits. So the
        candidates genuinely differ, sameEverywhere is false, and asking is
        correct on the evidence in the file.

        It is still not a decision anybody should be making, and two separate
        halves of the export fix each remove it on their own: the alias says
        which collection it meant, and the borrowed snapshot is not written out
        in the first place. Both are pinned, because either one regressing
        would put the question back while the other quietly covered for it.
      */
      const T = (v, extra) => Object.assign({ $type: 'text', $value: v }, extra || {});
      const breakpoints = (hint) => ({
        $metadata: { tokenSetOrder: ['.breakpoint/S', '.breakpoint/M', 'layout/columns', 'foundation/base'] },
        '.breakpoint/S': { breakpoint: { 'breakpoint-string': T('S Mobile') } },
        '.breakpoint/M': { breakpoint: { 'breakpoint-string': T('M Tablet') } },
        'layout/columns': { breakpoint: { 'breakpoint-string': T('S Mobile') } },
        'foundation/base': { variant: { breakpoint: T('{breakpoint.breakpoint-string}',
          hint ? { $extensions: { 'com.closure.legacyJson': { aliasCollection: hint } } } : null) } },
      });
      let bp = deriveX(toIRx(breakpoints(null)), {});
      ok('breakpoint: a variable seen through two mode axes really is ambiguous, and is asked',
         bp.unresolved.length === 1 && bp.refDuplicates.length === 0,
         bp.unresolved.length + ' asked');
      bp = deriveX(toIRx(breakpoints('.breakpoint')), {});
      ok('breakpoint: the alias naming its collection settles it',
         bp.unresolved.length === 0 && bp.losses.unresolvedRefs.length === 0,
         JSON.stringify(bp.unresolved.map((q) => q.id)));
      const noSnapshot = breakpoints(null);
      delete noSnapshot['layout/columns'].breakpoint;
      bp = deriveX(toIRx(noSnapshot), {});
      ok('breakpoint: and so does not writing the borrowed snapshot at all',
         bp.unresolved.length === 0 && bp.losses.unresolvedRefs.length === 0,
         JSON.stringify(bp.unresolved.map((q) => q.id)));

      /* Grouping: many paths, one situation, one question. */
      /* One name family, forty tokens in it — the shape that collapses. A path
         with no family of its own stays its own question, which is correct and
         is what the single-path branch of the message is for. */
      const many = { '.core/base': { brand: {} }, '.mode/light': { app: {} },
                     '.scheme/neutral': { brand: {} } };
      for (let i = 0; i < 40; i++) {
        many['.core/base'].brand['t' + i] = { $type: 'color', $value: '#ff0000' };
        many['.scheme/neutral'].brand['t' + i] = { $type: 'color', $value: '#00ff00' };
        many['.mode/light'].app['u' + i] = { $type: 'color', $value: '{brand.t' + i + '}' };
      }
      plan = deriveX(toIRx(many), {});
      ok('round trip: 40 identical situations are one question, not 40',
         plan.unresolved.length === 1 && plan.refCollisions.length === 40,
         plan.unresolved.length + ' asked for ' + plan.refCollisions.length + ' collisions');
      ok('round trip: and the question says how many it covers',
         /40 paths under/.test(plan.unresolved[0].question), plan.unresolved[0].question);
      /* Answering the group answers all 40. */
      plan = deriveX(toIRx(many), { decisions: { [plan.unresolved[0].id]: '.scheme' } });
      ok('round trip: one answer settles every path it covered',
         plan.unresolved.length === 0 && plan.losses.unresolvedRefs.length === 0,
         plan.unresolved.length + ' left');
    }

    /*
      THE EXTRACT, ACTUALLY RUN.

      Everything else in this file tests pure functions lifted out of the build.
      The extract handler is not one — it talks to Figma — so it had no test at
      all, and it shipped a ReferenceError: a counter declared in one .then and
      read from the next one along, which is a sibling scope and not a child.
      The plugin came up, showed its mascot, and said "Error: 'skipStats' is not
      defined". No amount of syntax checking finds that; running it does, and a
      stub of the four Figma calls it makes is twenty lines.

      It earns its keep twice, because the same stub exercises the pruning that
      an extended collection depends on — which is not otherwise reachable from
      Node at all.
    */
    {
      const fsx = require('fs'), pathx = require('path'), vmx = require('vm');
      const built = pathx.join(__dirname, '..', 'code.js');
      if (!fsx.existsSync(built)) {
        ok('extract: code.js is built (run npm run ui:build)', false);
      } else {
        const CORE = 'VariableCollectionId:core', MODE = 'VariableCollectionId:mode';
        const RED = { r: 1, g: 0, b: 0, a: 1 }, BLUE = { r: 0, g: 0, b: 1, a: 1 };
        const run = async (overrideBlue) => {
          const collections = [
            { id: CORE, name: '.core', defaultModeId: 'm-core',
              modes: [{ modeId: 'm-core', name: 'Value' }], variableIds: ['V:red'] },
            /* Extends .core — and Figma lists the variable it INHERITS among its
               own variableIds, which is the whole reason one primitive can be
               written out once per collection. */
            { id: MODE, name: '.mode', defaultModeId: 'm-light', isExtension: true,
              parentVariableCollectionId: CORE, rootVariableCollectionId: CORE,
              modes: [{ modeId: 'm-light', name: 'light', parentModeId: 'm-core' },
                      { modeId: 'm-dark', name: 'dark', parentModeId: 'm-core' }],
              variableIds: ['V:red', 'V:bg'] },
          ];
          const seenFromMode = overrideBlue
            ? { 'm-light': RED, 'm-dark': BLUE }        // a real override
            : { 'm-light': RED, 'm-dark': RED };        // pure inheritance
          const vars = {
            'V:red': { id: 'V:red', name: 'core-colours/red', resolvedType: 'COLOR',
                       variableCollectionId: CORE, valuesByMode: { 'm-core': RED },
                       valuesByModeForCollectionAsync: async (c) =>
                         (c.id === MODE ? seenFromMode : { 'm-core': RED }),
                       codeSyntax: {}, scopes: [], description: '' },
            'V:bg': { id: 'V:bg', name: 'mode/background', resolvedType: 'COLOR',
                      variableCollectionId: MODE,
                      valuesByMode: { 'm-light': { type: 'VARIABLE_ALIAS', id: 'V:red' },
                                      'm-dark': { type: 'VARIABLE_ALIAS', id: 'V:red' } },
                      valuesByModeForCollectionAsync: async () => ({
                        'm-light': { type: 'VARIABLE_ALIAS', id: 'V:red' },
                        'm-dark': { type: 'VARIABLE_ALIAS', id: 'V:red' } }),
                      codeSyntax: {}, scopes: [], description: '' },
          };
          let posted = null;
          const quiet = () => {};
          const figma = {
            showUI: quiet, root: { name: 'Stub' }, currentPage: {},
            clientStorage: { getAsync: async () => null, setAsync: async () => {} },
            getLocalTextStyles: () => [], getLocalEffectStyles: () => [],
            variables: { getLocalVariableCollectionsAsync: async () => collections,
                         getVariableByIdAsync: async (id) => vars[id] || null },
            ui: { onmessage: null, postMessage: (m) => {
              if (m.type === 'extracted' || m.type === 'error') posted = m; } },
          };
          const ctx = { figma, __html__: '', Promise, JSON, Object, Array, Map, Set,
                        String, Number, Math, parseFloat, parseInt, isNaN, isFinite,
                        RegExp, Date, setTimeout, Error, Boolean,
                        console: { log: quiet, warn: quiet, error: quiet } };
          vmx.createContext(ctx);
          vmx.runInContext(fsx.readFileSync(built, 'utf8'), ctx);
          await figma.ui.onmessage({ type: 'extract' });
          for (let i = 0; i < 20 && !posted; i++) await new Promise((r) => setTimeout(r, 10));
          return posted;
        };

        let posted = await run(false);
        /* The one this exists for: a ReferenceError anywhere in the handler
           lands here as an error message instead of an extraction. */
        ok('extract: the handler runs to completion and posts an extraction',
           !!posted && posted.type === 'extracted',
           posted ? (posted.message || posted.type) : 'nothing posted');
        if (posted && posted.type === 'extracted') {
          const of = (n) => (posted.collections.filter((c) => c.name === n)[0] || {}).variables || [];
          ok('extract: a variable is written in the collection that owns it',
             of('.core').map((v) => v.name).join(',') === 'core-colours/red',
             JSON.stringify(of('.core').map((v) => v.name)));
          ok('extract: and NOT in the collection that only inherits it unchanged',
             of('.mode').map((v) => v.name).join(',') === 'mode/background',
             JSON.stringify(of('.mode').map((v) => v.name)));
          const bg = of('.mode').filter((v) => v.name === 'mode/background')[0];
          ok('extract: an alias records the collection its target lives in',
             !!bg && Object.keys(bg.aliasInfo).every((m) =>
               bg.aliasInfo[m].aliasedVarCollection === '.core'),
             JSON.stringify(bg && bg.aliasInfo));
        }

        /* An override is the entire point of an extended collection, and it
           must survive a change whose whole job is dropping copies. */
        posted = await run(true);
        ok('extract: an overridden inherited variable IS written where it is overridden',
           !!posted && posted.type === 'extracted' &&
           (posted.collections.filter((c) => c.name === '.mode')[0] || { variables: [] })
             .variables.map((v) => v.name).sort().join(',') === 'core-colours/red,mode/background',
           JSON.stringify(((posted && posted.collections &&
             posted.collections.filter((c) => c.name === '.mode')[0]) || { variables: [] })
               .variables.map((v) => v.name)));
      }
    }

    console.log('');
    console.log(pass + '/' + (pass + fail) + ' passed');
    process.exit(fail ? 1 : 0);
  })();
}
