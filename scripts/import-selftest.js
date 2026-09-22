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

    console.log('');
    console.log(pass + '/' + (pass + fail) + ' passed');
    process.exit(fail ? 1 : 0);
  })();
}
